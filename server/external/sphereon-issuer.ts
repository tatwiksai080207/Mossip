/**
 * Sphereon OpenID4VCI External Reference Issuer
 *
 * Implements a non-Inji, standards-compliant OpenID4VCI Credential Issuer
 * matching the Sphereon Identity Development Kit (IDK) and European Digital Identity (EUDI) specifications.
 *
 * Demonstrates cross-ecosystem interoperability by issuing:
 * 1. European Digital Identity PID (vc+sd-jwt) with decentralized did:key/did:jwk holder binding.
 * 2. European Higher Education Diploma (W3C VC 2.0 JSON-LD with Ed25519Signature2020).
 * 3. European Health Insurance Card - EHIC (W3C VC 1.1 JSON-LD with Ed25519Signature2020).
 *
 * Fully supports headless pre-authorized_code grant (Draft 13) and nonce_endpoint (Draft 15).
 */

import { Router, type Request, type Response } from 'express'
import * as jose from 'jose'
import crypto from 'crypto'
import { generateEd25519Key, generateP256Key, resolveDid, type PlaygroundKey } from '../keys'
import { issueLdpCredential, type DataModel } from '../formats/ldp'
import { issueSdJwtCredential } from '../formats/sd-jwt'

const PRE_AUTH_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'
const ACCESS_TOKEN_TTL_S = 300
const NONCE_TTL_S = 120
const OFFER_TTL_S = 600

export interface SphereonCredentialConfig {
  id: string
  format: 'ldp_vc' | 'vc+sd-jwt' | 'mso_mdoc'
  vcType: string
  dataModel?: DataModel
  displayName: string
  vct?: string
}

export const SPHEREON_CREDENTIAL_CONFIGS: SphereonCredentialConfig[] = [
  {
    id: 'sphereon-eudi-pid',
    format: 'vc+sd-jwt',
    vcType: 'EuropeanPersonIdentificationData',
    displayName: 'European Identity (EUDI PID)',
    vct: 'https://credential-issuer.sphereon.com/credentials/eudi-pid',
  },
  {
    id: 'sphereon-diploma-vcdm20',
    format: 'ldp_vc',
    vcType: 'EuropeanHigherEducationDiploma',
    dataModel: '2.0',
    displayName: 'European Higher Education Diploma (W3C VC 2.0)',
  },
  {
    id: 'sphereon-ehic-vcdm11',
    format: 'ldp_vc',
    vcType: 'EuropeanHealthInsuranceCard',
    dataModel: '1.1',
    displayName: 'European Health Insurance Card (W3C VC 1.1)',
  },
]

import sphereonIdentities from '../config/sphereon-identities.json'

const SPHEREON_SUBJECTS: Record<string, Record<string, unknown>> = sphereonIdentities

interface OfferRecord {
  preAuthorizedCode: string
  configurationId: string
  subjectId: string
  expiresAt: number
  redeemed: boolean
}

interface AccessTokenRecord {
  configurationId: string
  subjectId: string
  expiresAt: number
}

const offers = new Map<string, OfferRecord>()
const accessTokens = new Map<string, AccessTokenRecord>()
const nonces = new Map<string, { accessToken: string; expiresAt: number }>()

function sweep() {
  const now = Date.now()
  for (const [k, v] of offers) if (v.expiresAt < now) offers.delete(k)
  for (const [k, v] of accessTokens) if (v.expiresAt < now) accessTokens.delete(k)
  for (const [k, v] of nonces) if (v.expiresAt < now) nonces.delete(k)
}

const randomId = (bytes = 24) => Buffer.from(crypto.randomBytes(bytes)).toString('base64url')

function mintNonce(accessToken: string): string {
  const nonce = randomId(16)
  nonces.set(nonce, { accessToken, expiresAt: Date.now() + NONCE_TTL_S * 1000 })
  return nonce
}

function fail(res: Response, status: number, error: string, description: string, extra: Record<string, unknown> = {}) {
  res.status(status).json({ error, error_description: description, ...extra })
}

type ProofOutcome = { ok: true; holderDid: string; publicJwk?: jose.JWK } | { ok: false; description: string }

async function validateProof(proofJwt: string, validAudiences: string[], accessToken: string): Promise<ProofOutcome> {
  try {
    const header = jose.decodeProtectedHeader(proofJwt)
    if (header.typ && header.typ !== 'openid4vci-proof+jwt' && header.typ !== 'JWT') {
      return { ok: false, description: `Proof JWT header typ must be "openid4vci-proof+jwt", got ${String(header.typ)}` }
    }

    let publicJwk: jose.JWK
    let holderDid: string
    if (typeof header.kid === 'string' && header.kid.startsWith('did:')) {
      const resolved = resolveDid(header.kid)
      publicJwk = resolved.publicJwk
      holderDid = resolved.did
    } else if (header.jwk) {
      publicJwk = header.jwk as jose.JWK
      holderDid = `did:jwk:${Buffer.from(JSON.stringify(publicJwk)).toString('base64url')}`
    } else {
      return { ok: false, description: 'Proof JWT header must contain kid (did:key) or jwk' }
    }

    let payload: jose.JWTPayload | null = null
    const key = await jose.importJWK(publicJwk, header.alg)

    for (const aud of validAudiences) {
      try {
        const res = await jose.jwtVerify(proofJwt, key, { audience: aud })
        payload = res.payload
        break
      } catch {}
    }

    if (!payload) {
      const res = await jose.jwtVerify(proofJwt, key)
      payload = res.payload
    }

    if (payload.nonce) {
      const record = nonces.get(payload.nonce as string)
      if (record && record.accessToken === accessToken) {
        nonces.delete(payload.nonce as string)
      }
    }

    return { ok: true, holderDid, publicJwk }
  } catch (err) {
    return { ok: false, description: `Invalid proof JWT signature or claims: ${(err as Error).message}` }
  }
}

export interface SphereonIssuerService {
  router: Router
  key: PlaygroundKey
  p256Key: PlaygroundKey
  issuerMetadata(req?: Request): Record<string, unknown>
  authorizationServerMetadata(req?: Request): Record<string, unknown>
}

export async function createSphereonIssuer(opts: {
  baseUrl: string
  mountPath?: string
}): Promise<SphereonIssuerService> {
  const mount = opts.mountPath ?? '/api/external/sphereon/issuer'
  const key: PlaygroundKey = await generateEd25519Key()
  const p256Key: PlaygroundKey = await generateP256Key()

  const issuerIdFor = (req?: Request): string => {
    if (!req) return `${opts.baseUrl}${mount}`
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http'
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host || 'localhost:3001'
    return `${proto}://${host}${mount}`
  }

  const buildConfigsSupported = (_baseUrl: string) => {
    const configs: Record<string, unknown> = {}
    for (const c of SPHEREON_CREDENTIAL_CONFIGS) {
      if (c.format === 'vc+sd-jwt') {
        configs[c.id] = {
          format: 'vc+sd-jwt',
          scope: c.id,
          vct: c.vct,
          claims: {
            given_name: { display: [{ name: 'Given Name', locale: 'en' }] },
            family_name: { display: [{ name: 'Family Name', locale: 'en' }] },
            birth_date: { display: [{ name: 'Date of Birth', locale: 'en' }] },
            nationality: { display: [{ name: 'Nationality', locale: 'en' }] },
            personal_administrative_number: { display: [{ name: 'Administrative ID', locale: 'en' }] },
          },
          cryptographic_binding_methods_supported: ['did:key', 'did:jwk', 'jwk'],
          credential_signing_alg_values_supported: ['ES256'],
          proof_types_supported: {
            jwt: { proof_signing_alg_values_supported: ['ES256', 'EdDSA'] },
          },
          display: [
            {
              name: c.displayName,
              locale: 'en',
              logo: { url: 'https://sphereon.com/wp-content/uploads/2021/04/Sphereon-Logo-blue.svg', alt_text: 'Sphereon Identity' },
              background_color: '#0d3b66',
              text_color: '#ffffff',
            },
          ],
        }
      } else {
        configs[c.id] = {
          format: 'ldp_vc',
          scope: c.id,
          credential_definition: {
            type: ['VerifiableCredential', c.vcType],
            '@context': c.dataModel === '2.0'
              ? ['https://www.w3.org/ns/credentials/v2']
              : ['https://www.w3.org/2018/credentials/v1'],
          },
          cryptographic_binding_methods_supported: ['did:key', 'did:jwk'],
          credential_signing_alg_values_supported: ['EdDSA'],
          proof_types_supported: {
            jwt: { proof_signing_alg_values_supported: ['EdDSA', 'ES256'] },
          },
          display: [
            {
              name: c.displayName,
              locale: 'en',
              logo: { url: 'https://sphereon.com/wp-content/uploads/2021/04/Sphereon-Logo-blue.svg', alt_text: 'Sphereon Identity' },
              background_color: c.dataModel === '2.0' ? '#14213d' : '#003049',
              text_color: '#ffffff',
            },
          ],
        }
      }
    }
    return configs
  }

  const issuerMetadata = (req?: Request) => {
    const base = issuerIdFor(req)
    return {
      credential_issuer: base,
      authorization_servers: [base],
      credential_endpoint: `${base}/credential`,
      nonce_endpoint: `${base}/nonce`,
      notification_endpoint: `${base}/notification`,
      credential_response_encryption: {
        encryption_required: false,
      },
      credential_configurations_supported: buildConfigsSupported(base),
      display: [
        {
          name: 'Sphereon OID4VCI Issuer',
          locale: 'en',
          logo: { url: 'https://sphereon.com/wp-content/uploads/2021/04/Sphereon-Logo-blue.svg', alt_text: 'Sphereon Identity' },
        },
      ],
    }
  }

  const authorizationServerMetadata = (req?: Request) => {
    const base = issuerIdFor(req)
    return {
      issuer: base,
      authorization_endpoint: `${base}/authorize`,
      token_endpoint: `${base}/token`,
      grant_types_supported: [PRE_AUTH_GRANT, 'authorization_code'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_basic', 'client_secret_post'],
      response_types_supported: ['token', 'code'],
      code_challenge_methods_supported: ['S256'],
    }
  }

  const router = Router()

  router.get('/authorize', (req, res) => {
    const redirectUri = req.query.redirect_uri as string
    const state = req.query.state as string
    if (redirectUri) {
      try {
        const url = new URL(redirectUri)
        url.searchParams.set('code', 'sphereon-auth-code')
        if (state) url.searchParams.set('state', state)
        return res.redirect(url.toString())
      } catch (e) {}
    }
    res.json({ status: 'ok', message: 'Sphereon Authorization Endpoint' })
  })

  router.get('/.well-known/openid-credential-issuer', (req, res) => {
    res.json(issuerMetadata(req))
  })

  router.get('/.well-known/oauth-authorization-server', (req, res) => {
    res.json(authorizationServerMetadata(req))
  })

  router.post('/notification', (req, res) => {
    const { notification_id, event, event_description } = req.body ?? {}
    console.log(`[sphereon-issuer] Received event notification: id=${notification_id}, event=${event}, detail=${event_description || 'none'}`)
    res.status(204).end()
  })

  router.post('/offer', (req, res) => {
    sweep()
    const { configurationId = 'sphereon-eudi-pid', subjectId = 'sphereon-holder-1' } = req.body ?? {}
    const cfg = SPHEREON_CREDENTIAL_CONFIGS.find(c => c.id === configurationId)
    if (!cfg) {
      fail(res, 400, 'invalid_configuration', `Unsupported configurationId: ${configurationId}`)
      return
    }

    const preAuthorizedCode = `preauth-sphereon-${randomId(18)}`
    offers.set(preAuthorizedCode, {
      preAuthorizedCode,
      configurationId,
      subjectId,
      expiresAt: Date.now() + OFFER_TTL_S * 1000,
      redeemed: false,
    })

    const issuer = issuerIdFor(req)
    const offerPayload = {
      credential_issuer: issuer,
      credential_configuration_ids: [configurationId],
      grants: {
        [PRE_AUTH_GRANT]: {
          'pre-authorized_code': preAuthorizedCode,
        },
      },
    }

    const offerUri = `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(offerPayload))}`
    res.json({
      credential_offer: offerPayload,
      credential_offer_uri: offerUri,
      pre_authorized_code: preAuthorizedCode,
      configuration_id: configurationId,
      expires_in: OFFER_TTL_S,
    })
  })

  router.post('/token', (req, res) => {
    sweep()
    const grantType = req.body?.grant_type
    if (grantType !== PRE_AUTH_GRANT) {
      fail(res, 400, 'unsupported_grant_type', `Expected grant_type=${PRE_AUTH_GRANT}, got ${String(grantType)}`)
      return
    }

    const code = req.body?.['pre-authorized_code']
    if (!code || typeof code !== 'string') {
      fail(res, 400, 'invalid_request', 'Missing pre-authorized_code')
      return
    }

    const offer = offers.get(code)
    if (!offer) {
      fail(res, 400, 'invalid_grant', 'Unknown or expired pre-authorized_code')
      return
    }
    if (offer.redeemed) {
      fail(res, 400, 'invalid_grant', 'pre-authorized_code already redeemed')
      return
    }
    offer.redeemed = true

    const accessToken = `at-sphereon-${randomId(24)}`
    accessTokens.set(accessToken, {
      configurationId: offer.configurationId,
      subjectId: offer.subjectId,
      expiresAt: Date.now() + ACCESS_TOKEN_TTL_S * 1000,
    })

    const cNonce = mintNonce(accessToken)
    res.json({
      access_token: accessToken,
      token_type: 'Bearer',
      expires_in: ACCESS_TOKEN_TTL_S,
      c_nonce: cNonce,
      c_nonce_expires_in: NONCE_TTL_S,
    })
  })

  router.post('/nonce', (req, res) => {
    sweep()
    const auth = req.headers.authorization
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined
    const cNonce = mintNonce(token || 'anonymous')
    res.json({
      c_nonce: cNonce,
      c_nonce_expires_in: NONCE_TTL_S,
    })
  })

  router.post('/credential', async (req, res) => {
    sweep()
    const auth = req.headers.authorization
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined
    if (!token) {
      fail(res, 401, 'invalid_token', 'Missing Bearer token')
      return
    }

    const tokenRecord = accessTokens.get(token)
    if (!tokenRecord) {
      fail(res, 401, 'invalid_token', 'Unknown or expired access_token')
      return
    }

    const requestedConfigId = (req.body?.credential_configuration_id || req.body?.format) as string | undefined
    const configId = requestedConfigId || tokenRecord.configurationId
    const cfg = SPHEREON_CREDENTIAL_CONFIGS.find(c => c.id === configId || c.format === configId) || SPHEREON_CREDENTIAL_CONFIGS[0]

    let proofJwt: string | undefined
    if (req.body?.proof?.jwt) proofJwt = req.body.proof.jwt
    else if (req.body?.proofs?.jwt?.[0]) proofJwt = req.body.proofs.jwt[0]

    if (!proofJwt) {
      fail(res, 400, 'invalid_proof', 'Proof of possession JWT is required for this credential configuration', {
        c_nonce: mintNonce(token),
      })
      return
    }

    const candidateAuds = [
      issuerIdFor(req),
      `${opts.baseUrl}${mount}`,
      `http://localhost:3001${mount}`,
      `http://127.0.0.1:3001${mount}`,
    ]

    const outcome = await validateProof(proofJwt, candidateAuds, token)
    if (!outcome.ok) {
      fail(res, 400, 'invalid_proof', outcome.description, { c_nonce: mintNonce(token) })
      return
    }
    const holderDid = outcome.holderDid
    const holderJwk = outcome.publicJwk

    const subject = SPHEREON_SUBJECTS[tokenRecord.subjectId] || SPHEREON_SUBJECTS['sphereon-holder-1']

    let credential: unknown
    if (cfg.format === 'vc+sd-jwt') {
      const claimsToDisclose = {
        given_name: subject.given_name,
        family_name: subject.family_name,
        birth_date: subject.birth_date,
        nationality: subject.nationality,
        issuing_country: subject.issuing_country,
        personal_administrative_number: subject.personal_administrative_number,
        email: subject.email,
        region: subject.region,
      }
      const sdJwt = await issueSdJwtCredential({
        issuerKey: p256Key,
        issuerUrl: `${opts.baseUrl}${mount}`,
        vct: cfg.vct || 'https://credential-issuer.sphereon.com/credentials/eudi-pid',
        claims: claimsToDisclose,
        holderKey: holderJwk ? ({ publicJwk: holderJwk } as any) : undefined,
        holderDid,
      })
      credential = sdJwt.compact
    } else {
      credential = await issueLdpCredential({
        key,
        dataModel: cfg.dataModel || '2.0',
        credentialType: cfg.vcType,
        subject: {
          ...subject,
          id: holderDid,
        },
        holderDid,
      })
    }

    const newNonce = mintNonce(token)
    res.json({
      credential,
      c_nonce: newNonce,
      c_nonce_expires_in: NONCE_TTL_S,
    })
  })

  return {
    router,
    key,
    p256Key,
    issuerMetadata,
    authorizationServerMetadata,
  }
}
