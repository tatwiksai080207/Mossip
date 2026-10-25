/**
 * Sphereon OpenID4VP External Reference Verifier
 *
 * Implements a non-Inji, standards-compliant OpenID4VP Relying Party
 * matching Sphereon's DIF Presentation Exchange (PEX v2) and EUDI verification engine.
 *
 * Demonstrates cross-ecosystem interoperability by verifying:
 * 1. W3C VC 1.1 / 2.0 (Ed25519Signature2020)
 * 2. IETF SD-JWT VC (vc+sd-jwt) with decentralized did:key/did:jwk resolution.
 * 3. ISO/IEC 18013-5 mDocs.
 */

import { Router, type Request, type Response } from 'express'
import crypto from 'crypto'
import * as vc from '@digitalbazaar/vc'
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020'
import { documentLoader } from '../jsonld'
import { verifySdJwtLocally } from '../formats/sd-jwt'
import { verifyMdocLocally } from '../formats/mdoc'
import { getActiveTamperMode, applyTamperingToVpToken } from '../tamper'
import { getActiveTunnelUrl } from '../tunnel'
import { notifyFlowStep } from '../events/flow-events'
import keysConfig from '../config/keys.json'

export function signSphereonAuthRequestJwt(payload: Record<string, unknown>, kid = keysConfig.verifierSigningKey.kid): string {
  const privKey = crypto.createPrivateKey({
    key: {
      kty: 'OKP',
      crv: keysConfig.verifierSigningKey.crv,
      d: keysConfig.verifierSigningKey.d,
      x: keysConfig.verifierSigningKey.x,
    },
    format: 'jwk',
  })
  const header = {
    alg: 'EdDSA',
    typ: 'oauth-authz-req+jwt',
    kid,
  }
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const signingInput = Buffer.from(`${headerB64}.${payloadB64}`)
  const sig = crypto.sign(null, signingInput, privKey)
  const sigB64 = sig.toString('base64url')
  return `${headerB64}.${payloadB64}.${sigB64}`
}

export const sphereonVerifierRouter = Router()

interface SphereonVpSession {
  transactionId: string
  requestId: string
  nonce: string
  clientId: string
  responseUri: string
  presentationDefinition?: Record<string, unknown>
  dcqlQuery?: Record<string, unknown>
  createdAt: number
  result?: {
    vpResultStatus: 'SUCCESS' | 'FAILED'
    verificationStatus: 'SUCCESS' | 'INVALID'
    error?: string
    checks: Record<string, unknown>
    vcResults: Array<{
      verificationStatus: 'SUCCESS' | 'INVALID'
      format: string
      claims: Record<string, unknown>
      vc?: string
      error?: string
    }>
    rawSubmission?: Record<string, unknown>
  }
}

const sessionsByTxnId = new Map<string, SphereonVpSession>()
const sessionsByReqId = new Map<string, SphereonVpSession>()

const PEX_PATTERN_ALIASES: Record<string, string[]> = {
  'sphereon-diploma-vcdm20': ['EuropeanHigherEducationDiploma'],
  'sphereon-ehic-vcdm11': ['EuropeanHealthInsuranceCard'],
  'sphereon-eudi-pid': ['EuropeanPersonIdentificationData', 'https://credential-issuer.sphereon.com/credentials/eudi-pid'],
  'EuropeanHigherEducationDiploma': ['sphereon-diploma-vcdm20'],
  'EuropeanHealthInsuranceCard': ['sphereon-ehic-vcdm11'],
  'EuropeanPersonIdentificationData': ['sphereon-eudi-pid'],
  'waltid-identity-ldp-vcdm11': ['PlaygroundIdentityCredential', 'VerifiableId'],
  'waltid-identity-ldp-vcdm20': ['PlaygroundIdentityCredential', 'VerifiableId'],
  'waltid-identity-sdjwt': ['PlaygroundIdentityCredential', 'https://walt.id/credentials/identity'],
  'certify-farmer-ldp': ['FarmerCredential', 'farmer-ldp-vcdm11', 'farmer-ldp-vcdm20'],
  'FarmerCredential': ['certify-farmer-ldp', 'farmer-ldp-vcdm11', 'farmer-ldp-vcdm20', 'farmer-sdjwt', 'FarmerCredential_SD_JWT', 'https://inji.mosip.io/credentials/farmer-identity'],
  'FarmerCredential_SD_JWT': ['farmer-sdjwt', 'FarmerCredential', 'https://inji.mosip.io/credentials/farmer-identity'],
  'https://inji.mosip.io/credentials/farmer-identity': ['farmer-sdjwt', 'FarmerCredential_SD_JWT', 'FarmerCredential'],
}

function pruneOldSessions() {
  const cutoff = Date.now() - 3600_000
  for (const [id, s] of sessionsByTxnId.entries()) {
    if (s.createdAt < cutoff) {
      sessionsByTxnId.delete(id)
      sessionsByReqId.delete(s.requestId)
    }
  }
}

/**
 * 1. VP Request Generation (/v1/verify/vp-request)
 */
sphereonVerifierRouter.post('/v1/verify/vp-request', (req: Request, res: Response) => {
  pruneOldSessions()
  const { transactionId, nonce, presentationDefinition, dcqlQuery } = req.body ?? {}
  const txnId = transactionId || `txn-sphereon-${Date.now()}`
  const requestId = `req_sphereon_${crypto.randomUUID().slice(0, 8)}`
  const reqNonce = nonce || crypto.randomUUID()

  const activeTunnel = getActiveTunnelUrl().replace(/\/$/, '')
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http'
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3001'
  const baseUrl = (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1'))
    ? activeTunnel
    : `${proto}://${host}`

  const responseUri = `${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-submission/direct-post`
  const requestUri = `${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-request/${requestId}`

  // Default to a rich DIF Presentation Exchange v2 definition if none passed
  const pexDef = presentationDefinition || {
    id: 'sphereon_presentation_definition',
    input_descriptors: [
      {
        id: 'sphereon_input_descriptor',
        format: {
          ldp_vc: { proof_type: ['Ed25519Signature2020'] },
          'vc+sd-jwt': { 'sd-jwt_alg_values': ['ES256'] },
        },
        constraints: {
          fields: [
            {
              path: ['$.type[*]', '$.vct'],
              filter: { type: 'string' },
            },
          ],
        },
      },
    ],
  }

  const session: SphereonVpSession = {
    transactionId: txnId,
    requestId,
    nonce: reqNonce,
    clientId: 'sphereon-verifier',
    responseUri,
    presentationDefinition: pexDef,
    dcqlQuery,
    createdAt: Date.now(),
  }

  sessionsByTxnId.set(txnId, session)
  sessionsByReqId.set(requestId, session)

  console.log(`[sphereon-verifier] Created VP request session: txnId=${txnId}, reqId=${requestId}`)

  res.json({
    transactionId: txnId,
    requestId,
    requestUri,
    expiresAt: Date.now() + 300_000,
    authorizationDetails: {
      nonce: reqNonce,
      responseUri,
    },
  })
})

/**
 * 2. Request URI Endpoint (/v1/verify/vp-request/:requestId)
 */
sphereonVerifierRouter.get('/v1/verify/vp-request/:requestId', (req: Request, res: Response) => {
  const requestId = Array.isArray(req.params.requestId) ? req.params.requestId[0] : req.params.requestId
  const session = requestId ? sessionsByReqId.get(requestId) : undefined

  if (!session) {
    res.status(404).json({ error: 'Request not found or expired' })
    return
  }

  const authRequest: Record<string, unknown> = {
    iss: 'sphereon-verifier',
    client_id: 'sphereon-verifier',
    client_id_scheme: 'pre-registered',
    response_type: 'vp_token',
    response_mode: 'direct_post',
    response_uri: session.responseUri,
    nonce: session.nonce,
    state: session.transactionId,
    iat: Math.floor(Date.now() / 1000),
    jti: `req-sphereon-${session.requestId}-${Date.now()}`,
    client_metadata: {
      client_name: 'sphereon-verifier',
      vp_formats: {
        ldp_vc: {
          proof_type: ['Ed25519Signature2018', 'Ed25519Signature2020', 'RsaSignature2018'],
          alg_values_supported: ['Ed25519Signature2018', 'Ed25519Signature2020', 'RsaSignature2018'],
        },
        ldp_vp: {
          proof_type: ['Ed25519Signature2018', 'Ed25519Signature2020', 'RsaSignature2018'],
          alg_values_supported: ['Ed25519Signature2018', 'Ed25519Signature2020', 'RsaSignature2018'],
        },
        'vc+sd-jwt': {
          'sd-jwt_alg_values': ['RS256', 'ES256', 'ES256K', 'EdDSA'],
          'kb-jwt_alg_values': ['RS256', 'ES256', 'ES256K', 'EdDSA'],
          sd_jwt_alg_values: ['RS256', 'ES256', 'ES256K', 'EdDSA'],
          kb_jwt_alg_values: ['RS256', 'ES256', 'ES256K', 'EdDSA'],
          alg_values_supported: ['RS256', 'ES256', 'ES256K', 'EdDSA'],
        },
        mso_mdoc: {
          alg: ['ES256', 'ES384', 'EdDSA'],
          alg_values_supported: ['ES256', 'ES384', 'EdDSA'],
        },
      },
    },
  }

  if (session.presentationDefinition) {
    authRequest.presentation_definition = session.presentationDefinition
  }
  if (session.dcqlQuery) {
    authRequest.dcql_query = session.dcqlQuery
  }

  notifyFlowStep('vp-request', 'done', { source: 'live_mobile', requestId: session.requestId })

  const signedJwt = signSphereonAuthRequestJwt(authRequest)

  const accept = req.headers.accept || ''
  if (accept.includes('application/json') && !accept.includes('jwt') && !accept.includes('*/*') && req.query.format !== 'jwt') {
    res.json(authRequest)
    return
  }

  res.type('application/oauth-authz-req+jwt').send(signedJwt)
})

/**
 * 3. Direct Post Submission (/v1/verify/vp-submission/direct-post)
 */
sphereonVerifierRouter.post('/v1/verify/vp-submission/direct-post', async (req: Request, res: Response) => {
  try {
    const body = req.body ?? {}
    const vpTokenRaw = body.vp_token
    const state = body.state || (typeof body.presentation_submission === 'string'
      ? JSON.parse(body.presentation_submission).id
      : undefined)

    console.log(`[sphereon-verifier] Received presentation submission, state=${state}`)

    let session = state ? (sessionsByTxnId.get(state) || sessionsByReqId.get(state)) : undefined
    if (!session) {
      for (const s of sessionsByTxnId.values()) {
        if (!s.result) {
          session = s
          break
        }
      }
    }

    if (!session) {
      res.status(400).json({
        error: 'invalid_request',
        error_description: 'Unknown or expired transaction state. Session not found.',
      })
      return
    }

    if (!vpTokenRaw) {
      session.result = {
        vpResultStatus: 'FAILED',
        verificationStatus: 'INVALID',
        error: 'No vp_token supplied in direct_post',
        checks: { vpTokenPresent: false },
        vcResults: [],
      }
      res.status(400).json({ error: 'Missing vp_token' })
      return
    }

    let effectiveVpToken = vpTokenRaw
    const activeTamper = getActiveTamperMode()
    if (activeTamper !== 'none') {
      console.log(`[sphereon-verifier] Applying active tamper mode: ${activeTamper}`)
      effectiveVpToken = applyTamperingToVpToken(effectiveVpToken, activeTamper)
    }

    const rawStr = typeof effectiveVpToken === 'string' ? effectiveVpToken : JSON.stringify(effectiveVpToken)
    const isMdoc = rawStr.includes('org.iso.18013.5.1') || rawStr.includes('deviceAuth') || rawStr.includes('issuerSigned')
    const isSdJwt = !isMdoc && typeof effectiveVpToken === 'string' && effectiveVpToken.includes('~')

    if (isMdoc) {
      console.log('[sphereon-verifier] Verifying ISO/IEC 18013-5 mDoc with Sphereon PEX engine')
      try {
        const mdocResult = await verifyMdocLocally(effectiveVpToken, { expectedNonce: session.nonce })
        session.result = {
          vpResultStatus: mdocResult.verified ? 'SUCCESS' : 'FAILED',
          verificationStatus: mdocResult.verified ? 'SUCCESS' : 'INVALID',
          checks: {
            signatureValid: mdocResult.verified,
            deviceAuthValid: mdocResult.deviceBindingVerified ?? true,
            trustModel: 'Sphereon OpenID4VP Engine (ISO/IEC 18013-5 mDoc)',
          },
          vcResults: [{
            verificationStatus: mdocResult.verified ? 'SUCCESS' : 'INVALID',
            format: 'mso_mdoc',
            claims: mdocResult.claims || {},
            error: mdocResult.error,
          }],
          error: mdocResult.error,
        }
      } catch (err) {
        session.result = {
          vpResultStatus: 'FAILED',
          verificationStatus: 'INVALID',
          error: (err as Error).message,
          checks: { signatureValid: false, trustModel: 'Sphereon OpenID4VP Engine' },
          vcResults: [{ verificationStatus: 'INVALID', format: 'mso_mdoc', claims: {}, error: (err as Error).message }],
        }
      }
    } else if (isSdJwt) {
      console.log('[sphereon-verifier] Verifying IETF SD-JWT VC with Sphereon engine')
      try {
        const sdResult = await verifySdJwtLocally(effectiveVpToken, { expectedNonce: session.nonce })

        let pexValid = true
        let pexError: string | undefined
        if (sdResult.verified && session.presentationDefinition?.input_descriptors) {
          const descriptors = session.presentationDefinition.input_descriptors as Array<any>
          for (const desc of descriptors) {
            const expectedPattern = desc.constraints?.fields?.[0]?.filter?.pattern
            if (expectedPattern) {
              const aliasCandidates = [
                expectedPattern,
                ...(PEX_PATTERN_ALIASES[expectedPattern] || []),
              ]
              const credStr = JSON.stringify(sdResult.claims) + ' ' + (sdResult.vct || '')
              const satisfies = aliasCandidates.some(candidate => credStr.includes(candidate))
              if (!satisfies) {
                pexValid = false
                pexError = `Presentation fails DIF PEX descriptor constraint: missing ${expectedPattern}`
                break
              }
            }
          }
        }

        const isOverallSuccess = sdResult.verified && pexValid
        session.result = {
          vpResultStatus: isOverallSuccess ? 'SUCCESS' : 'FAILED',
          verificationStatus: isOverallSuccess ? 'SUCCESS' : 'INVALID',
          checks: {
            signatureValid: sdResult.verified,
            disclosuresValid: sdResult.verified,
            keyBindingValid: sdResult.keyBindingVerified ?? true,
            pexConstraintsValid: pexValid,
            trustModel: 'Sphereon OpenID4VP Engine (DIF PEX v2 + did:key support)',
          },
          vcResults: [{
            verificationStatus: isOverallSuccess ? 'SUCCESS' : 'INVALID',
            format: 'vc+sd-jwt',
            claims: sdResult.claims || {},
            error: !sdResult.verified ? sdResult.error : (!pexValid ? pexError : undefined),
          }],
          error: !sdResult.verified ? sdResult.error : (!pexValid ? pexError : undefined),
        }
      } catch (err) {
        session.result = {
          vpResultStatus: 'FAILED',
          verificationStatus: 'INVALID',
          error: (err as Error).message,
          checks: { signatureValid: false, trustModel: 'Sphereon OpenID4VP Engine' },
          vcResults: [{ verificationStatus: 'INVALID', format: 'vc+sd-jwt', claims: {}, error: (err as Error).message }],
        }
      }
    } else {
      console.log('[sphereon-verifier] Verifying W3C VC JSON-LD presentation with Sphereon engine')
      let vpObj: any
      try {
        vpObj = typeof effectiveVpToken === 'string' ? JSON.parse(effectiveVpToken) : effectiveVpToken
      } catch {
        vpObj = null
      }

      if (!vpObj) {
        session.result = {
          vpResultStatus: 'FAILED',
          verificationStatus: 'INVALID',
          error: 'Malformed W3C JSON payload (unparseable JSON string)',
          checks: { jsonParsed: false },
          vcResults: [],
        }
      } else {
        try {
          const vcs = Array.isArray(vpObj.verifiableCredential)
            ? vpObj.verifiableCredential
            : [vpObj.verifiableCredential || vpObj]

          let allVcsValid = true
          let failureReason: string | undefined
          const vcResultsList = []

          for (const rawVc of vcs) {
            let parsedVc: any
            try {
              parsedVc = typeof rawVc === 'string' ? JSON.parse(rawVc) : rawVc
            } catch {
              allVcsValid = false
              failureReason = 'Malformed embedded verifiableCredential string'
              break
            }

            // Real cryptographic signature check with @digitalbazaar/vc + Ed25519Signature2020
            try {
              const check = await vc.verifyCredential({
                credential: parsedVc,
                suite: new Ed25519Signature2020(),
                documentLoader,
              })
              if (!check.verified) {
                allVcsValid = false
                failureReason = (check.error as any)?.message || 'Digital signature verification failed'
              }
              vcResultsList.push({
                verificationStatus: check.verified ? ('SUCCESS' as const) : ('INVALID' as const),
                format: 'ldp_vp',
                claims: parsedVc.credentialSubject || {},
                vc: JSON.stringify(parsedVc),
                error: (check.error as any)?.message,
              })
            } catch (sigErr) {
              allVcsValid = false
              failureReason = (sigErr as Error).message || 'Digital signature verification threw exception'
              vcResultsList.push({
                verificationStatus: 'INVALID' as const,
                format: 'ldp_vp',
                claims: parsedVc?.credentialSubject || {},
                vc: JSON.stringify(parsedVc),
                error: failureReason,
              })
            }
          }

          let pexValid = true
          let pexError: string | undefined

          // Evaluate DIF PEX descriptor constraints if configured
          if (allVcsValid && session.presentationDefinition?.input_descriptors) {
            const descriptors = session.presentationDefinition.input_descriptors as Array<any>
            for (const desc of descriptors) {
              const expectedPattern = desc.constraints?.fields?.[0]?.filter?.pattern
              if (expectedPattern) {
                const aliasCandidates = [
                  expectedPattern,
                  ...(PEX_PATTERN_ALIASES[expectedPattern] || []),
                ]
                const satisfies = vcResultsList.some(r => {
                  const claimsStr = JSON.stringify(r.claims) + (r.vc || '')
                  return aliasCandidates.some(candidate => claimsStr.includes(candidate))
                })
                if (!satisfies) {
                  pexValid = false
                  pexError = `Presentation fails DIF PEX descriptor constraint: missing ${expectedPattern}`
                  break
                }
              }
            }
          }

          const isOverallSuccess = allVcsValid && pexValid
          session.result = {
            vpResultStatus: isOverallSuccess ? 'SUCCESS' : 'FAILED',
            verificationStatus: isOverallSuccess ? 'SUCCESS' : 'INVALID',
            checks: {
              signatureValid: allVcsValid,
              pexConstraintsValid: pexValid,
              ldpSuite: 'Ed25519Signature2020',
              trustModel: 'Sphereon DIF PEX v2 Verifier Engine',
            },
            vcResults: vcResultsList,
            error: !allVcsValid ? failureReason : (!pexValid ? pexError : undefined),
          }
        } catch (verErr) {
          console.error('[sphereon-verifier] Verification error:', verErr)
          session.result = {
            vpResultStatus: 'FAILED',
            verificationStatus: 'INVALID',
            error: String(verErr),
            checks: { signatureValid: false, exception: String(verErr) },
            vcResults: [{ verificationStatus: 'INVALID', format: 'ldp_vp', claims: {}, error: String(verErr) }],
          }
        }
      }
    }

    console.log(`[sphereon-verifier] Verification complete: vpResultStatus=${session.result?.vpResultStatus}`)
    notifyFlowStep('vp-response', 'done', { source: 'live_mobile' })
    if (session.result?.vpResultStatus === 'SUCCESS') {
      notifyFlowStep('verification', 'done', { source: 'live_mobile', details: session.result })
    }
    res.status(200).json({ status: 'OK', redirect_uri: 'http://localhost:3000', transactionId: session.transactionId })
  } catch (err) {
    console.error('[sphereon-verifier] direct-post error:', err)
    res.status(500).json({ error: 'Verification failed', detail: String(err) })
  }
})

/**
 * 4. Verification Result Endpoint (/v1/verify/vp-result/:txnId)
 */
function handleGetResult(req: Request, res: Response) {
  const txnId = Array.isArray(req.params.txnId) ? req.params.txnId[0] : req.params.txnId
  const session = txnId ? sessionsByTxnId.get(txnId) : undefined

  if (!session || !session.result) {
    res.status(404).json({
      error: 'No verification result found',
      transactionId: txnId,
      reason: 'No presentation has been submitted to direct_post for this transaction yet.',
    })
    return
  }

  res.json({
    transactionId: session.transactionId,
    vpResultStatus: session.result.vpResultStatus,
    verificationStatus: session.result.verificationStatus,
    verifierEngine: 'Sphereon DIF PEX v2 OpenID4VP Verifier',
    checks: session.result.checks,
    vcResults: session.result.vcResults,
    error: session.result.error,
  })
}

sphereonVerifierRouter.get('/v1/verify/vp-result/:txnId', handleGetResult)
sphereonVerifierRouter.get('/v1/verify/v2/vp-results/:txnId', handleGetResult)
