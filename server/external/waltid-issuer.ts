/**
 * walt.id OpenID4VCI External Reference Issuer
 *
 * Implements a non-Inji, standards-compliant OpenID4VCI Credential Issuer
 * matching the walt.id Community Suite issuance engine.
 *
 * Demonstrates cross-ecosystem interoperability by issuing:
 * 1. W3C VC 1.1 / 2.0 (Ed25519Signature2020)
 * 2. IETF SD-JWT VC (vc+sd-jwt) with decentralized did:key/did:jwk holder binding.
 *
 * Fully supports headless pre-authorized_code grant (Draft 13) and nonce_endpoint (Draft 15).
 */

import { Router, type Request, type Response } from 'express'
import * as jose from 'jose'
import crypto from 'crypto'
import { generateEd25519Key, resolveDid, didKeyDocument, type PlaygroundKey } from '../keys'
import { issueLdpCredential, type DataModel } from '../formats/ldp'
import { issueSdJwtCredential } from '../formats/sd-jwt'
import { issueMdocCredential } from '../formats/mdoc'
import { getActiveTunnelUrl } from '../tunnel'

const PRE_AUTH_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'
const ACCESS_TOKEN_TTL_S = 300
const NONCE_TTL_S = 120
const OFFER_TTL_S = 600

export interface WaltIdCredentialConfig {
  id: string
  format: 'ldp_vc' | 'vc+sd-jwt' | 'mso_mdoc'
  vcType: string
  dataModel?: DataModel
  displayName: string
  vct?: string
}

export const WALTID_CREDENTIAL_CONFIGS: WaltIdCredentialConfig[] = [
  {
    id: 'waltid-identity-ldp-vcdm11',
    format: 'ldp_vc',
    vcType: 'PlaygroundIdentityCredential',
    dataModel: '1.1',
    displayName: 'walt.id Identity (W3C VC 1.1)',
  },
  {
    id: 'waltid-identity-ldp-vcdm20',
    format: 'ldp_vc',
    vcType: 'PlaygroundIdentityCredential',
    dataModel: '2.0',
    displayName: 'walt.id Identity (W3C VC 2.0)',
  },
  {
    id: 'waltid-identity-sdjwt',
    format: 'vc+sd-jwt',
    vcType: 'PlaygroundIdentityCredential',
    displayName: 'walt.id Identity (SD-JWT VC)',
    vct: 'https://walt.id/credentials/identity',
  },
  {
    id: 'waltid-drivinglicense-mdoc',
    format: 'mso_mdoc',
    vcType: 'DrivingLicenseCredential',
    displayName: 'walt.id Driving Licence (mDoc / mDL)',
  },
]

const SUBJECTS: Record<string, Record<string, unknown>> = {
  'waltid-holder-1': {
    fullName: 'Elena Rostova',
    dateOfBirth: '1993-11-20',
    gender: 'Female',
    email: 'elena.rostova@walt.id',
    region: 'Vienna',
  },
  'waltid-holder-2': {
    fullName: 'Lucas Weber',
    dateOfBirth: '1988-04-12',
    gender: 'Male',
    email: 'lucas.weber@walt.id',
    region: 'Berlin',
  },
}

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
      return { ok: false, description: 'Proof JWT missing holder public key: must supply kid starting with did: or jwk header' }
    }

    let payload: jose.JWTPayload | null = null
    const key = await jose.importJWK(publicJwk, header.alg)

    // Verify against valid candidate audiences (canonical issuer ID, request host, ngrok tunnel, localhost)
    let audMatched = false
    for (const aud of validAudiences) {
      try {
        const res = await jose.jwtVerify(proofJwt, key, { audience: aud })
        payload = res.payload
        audMatched = true
        break
      } catch {
        // Try next candidate audience
      }
    }

    if (!audMatched || !payload) {
      return { ok: false, description: `Proof JWT audience mismatch. Must match issuer endpoint (accepted: ${validAudiences.slice(0, 3).join(', ')})` }
    }

    const presented = payload.nonce
    if (typeof presented === 'string') {
      const record = nonces.get(presented)
      if (!record || record.expiresAt < Date.now() || record.accessToken !== accessToken) {
        return { ok: false, description: 'Proof JWT contains invalid or expired c_nonce' }
      }
      // Single-use: consume nonce upon successful validation
      nonces.delete(presented)
    }

    return { ok: true, holderDid, publicJwk }
  } catch (err: any) {
    return { ok: false, description: `Proof JWT cryptographic verification failed: ${err?.message || String(err)}` }
  }
}

function credentialConfigurationsSupported(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const cfg of WALTID_CREDENTIAL_CONFIGS) {
    if (cfg.format === 'vc+sd-jwt') {
      out[cfg.id] = {
        format: 'vc+sd-jwt',
        scope: cfg.id,
        vct: cfg.vct || 'https://walt.id/credentials/identity',
        cryptographic_binding_methods_supported: ['jwk', 'did:key', 'did:jwk'],
        credential_signing_alg_values_supported: ['ES256', 'EdDSA'],
        proof_types_supported: {
          jwt: { proof_signing_alg_values_supported: ['EdDSA', 'ES256'] },
        },
        claims: {
          fullName: { display: [{ name: 'Full Name', locale: 'en' }] },
          dateOfBirth: { display: [{ name: 'Date of Birth', locale: 'en' }] },
          gender: { display: [{ name: 'Gender', locale: 'en' }] },
          email: { display: [{ name: 'Email', locale: 'en' }] },
          region: { display: [{ name: 'Region', locale: 'en' }] },
        },
        display: [{
          name: cfg.displayName,
          locale: 'en',
          background_color: '#312e81',
          text_color: '#ffffff',
          logo: {
            url: 'https://walt.id/favicon.ico',
            alt_text: 'walt.id logo'
          }
        }],
      }
      continue
    }

    if (cfg.format === 'mso_mdoc') {
      out[cfg.id] = {
        format: 'mso_mdoc',
        scope: cfg.id,
        doctype: 'org.iso.18013.5.1.mDL',
        cryptographic_binding_methods_supported: ['jwk', 'did:key', 'cose_key'],
        credential_signing_alg_values_supported: ['ES256'],
        proof_types_supported: {
          jwt: { proof_signing_alg_values_supported: ['ES256', 'EdDSA'] },
        },
        claims: {
          'org.iso.18013.5.1': {
            family_name: { display: [{ name: 'Family Name', locale: 'en' }] },
            given_name: { display: [{ name: 'Given Name', locale: 'en' }] },
            birth_date: { display: [{ name: 'Birth Date', locale: 'en' }] },
            issue_date: { display: [{ name: 'Issue Date', locale: 'en' }] },
            expiry_date: { display: [{ name: 'Expiry Date', locale: 'en' }] },
            issuing_country: { display: [{ name: 'Issuing Country', locale: 'en' }] },
            issuing_authority: { display: [{ name: 'Issuing Authority', locale: 'en' }] },
            document_number: { display: [{ name: 'Document Number', locale: 'en' }] },
            driving_privileges: { display: [{ name: 'Driving Privileges', locale: 'en' }] },
          },
        },
        display: [{
          name: cfg.displayName,
          locale: 'en',
          background_color: '#312e81',
          text_color: '#ffffff',
          logo: {
            url: 'https://walt.id/favicon.ico',
            alt_text: 'walt.id logo'
          }
        }],
      }
      continue
    }

    out[cfg.id] = {
      format: cfg.format,
      scope: cfg.id,
      cryptographic_binding_methods_supported: ['did:key', 'did:jwk'],
      credential_signing_alg_values_supported: ['Ed25519Signature2020'],
      proof_types_supported: {
        jwt: { proof_signing_alg_values_supported: ['EdDSA', 'ES256'] },
      },
      credential_definition: {
        type: ['VerifiableCredential', cfg.vcType],
        credentialSubject: {
          fullName: { display: [{ name: 'Full Name', locale: 'en' }] },
          dateOfBirth: { display: [{ name: 'Date of Birth', locale: 'en' }] },
          gender: { display: [{ name: 'Gender', locale: 'en' }] },
          email: { display: [{ name: 'Email', locale: 'en' }] },
          region: { display: [{ name: 'Region', locale: 'en' }] },
        },
      },
      display: [{
        name: cfg.displayName,
        locale: 'en',
        background_color: '#1e1b4b',
        text_color: '#ffffff',
        logo: {
          url: 'https://walt.id/favicon.ico',
          alt_text: 'walt.id logo'
        }
      }],
      'x-vc-data-model': cfg.dataModel,
    }
  }
  return out
}

export interface WaltIdIssuerInstance {
  router: Router
  key: PlaygroundKey
  identifier: string
  issuerMetadata: (req?: Request) => Record<string, unknown>
  authorizationServerMetadata: (req?: Request) => Record<string, unknown>
}

export async function createWaltIdIssuer(opts: { baseUrl: string; mountPath: string }): Promise<WaltIdIssuerInstance> {
  const key = await generateEd25519Key()
  const router = Router()
  const mountPath = opts.mountPath.replace(/\/$/, '')
  const defaultBaseUrl = opts.baseUrl.replace(/\/$/, '')
  const identifier = `${defaultBaseUrl}${mountPath}`

  const getBaseUrl = (req?: Request) => {
    if (req?.headers?.host) {
      const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http'
      return `${proto}://${req.headers.host}`
    }
    return defaultBaseUrl
  }

  const issuerMetadata = (req?: Request) => {
    const baseUrl = getBaseUrl(req)
    const id = `${baseUrl}${mountPath}`
    const publicId = `${defaultBaseUrl}${mountPath}`
    return {
      credential_issuer: id,
      credential_endpoint: `${id}/credential`,
      nonce_endpoint: `${id}/nonce`,
      authorization_servers: [publicId],
      token_endpoint: `${id}/token`,
      jwks_uri: `${id}/.well-known/jwks.json`,
      credential_configurations_supported: credentialConfigurationsSupported(),
      display: [{ name: 'walt.id External Reference Issuer', locale: 'en' }],
      'x-issuer-did': key.did,
      'x-issuer-engine': 'walt.id Community Suite (OpenID4VCI)',
    }
  }

  const authorizationServerMetadata = (req?: Request) => {
    const baseUrl = getBaseUrl(req)
    const id = `${baseUrl}${mountPath}`
    return {
      issuer: id,
      authorization_endpoint: `${id}/authorize`,
      token_endpoint: `${id}/token`,
      jwks_uri: `${id}/.well-known/jwks.json`,
      grant_types_supported: [PRE_AUTH_GRANT, 'authorization_code'],
      'pre-authorized_grant_anonymous_access_supported': true,
      response_types_supported: ['token', 'code'],
      token_endpoint_auth_methods_supported: ['none'],
    }
  }

  // ── Discovery endpoints ───────────────────────────────────────────────────
  router.get('/authorize', (req, res) => {
    const redirectUri = req.query.redirect_uri as string
    const state = req.query.state as string
    if (redirectUri) {
      try {
        const url = new URL(redirectUri)
        url.searchParams.set('code', 'waltid-auth-code')
        if (state) url.searchParams.set('state', state)
        return res.redirect(url.toString())
      } catch (e) {}
    }
    res.json({ status: 'ok', message: 'walt.id Authorization Endpoint' })
  })

  router.get('/.well-known/openid-credential-issuer', (req, res) => res.json(issuerMetadata(req)))
  router.get('/.well-known/oauth-authorization-server', (req, res) => res.json(authorizationServerMetadata(req)))
  router.get('/.well-known/jwks.json', (_req, res) => {
    res.json({ keys: [{ ...key.publicJwk, kid: key.verificationMethod, use: 'sig', alg: 'EdDSA' }] })
  })
  router.get('/did.json', (_req, res) => res.json(didKeyDocument(key)))

  // ── Credential offer endpoint ─────────────────────────────────────────────
  router.post('/offer', (req: Request, res: Response) => {
    sweep()
    const { configurationId, subjectId = 'waltid-holder-1' } = req.body ?? {}
    const cfg = WALTID_CREDENTIAL_CONFIGS.find(c => c.id === configurationId || c.vcType === configurationId) ?? WALTID_CREDENTIAL_CONFIGS[0]
    const baseUrl = getBaseUrl(req)
    const id = `${baseUrl}${mountPath}`

    const preAuthorizedCode = randomId()
    offers.set(preAuthorizedCode, {
      preAuthorizedCode,
      configurationId: cfg.id,
      subjectId: SUBJECTS[subjectId] ? subjectId : 'waltid-holder-1',
      expiresAt: Date.now() + OFFER_TTL_S * 1000,
      redeemed: false,
    })

    const credentialOffer: Record<string, unknown> = {
      credential_issuer: id,
      credential_configuration_ids: [cfg.id],
      grants: {
        [PRE_AUTH_GRANT]: {
          'pre-authorized_code': preAuthorizedCode,
        },
      },
    }

    console.log(`[waltid-issuer] Created offer: config=${cfg.id}, code=${preAuthorizedCode.slice(0, 8)}...`)

    res.json({
      credential_offer: credentialOffer,
      credential_offer_uri: `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(credentialOffer))}`,
      expires_in: OFFER_TTL_S,
    })
  })

  // ── Token endpoint ────────────────────────────────────────────────────────
  router.post('/token', (req: Request, res: Response) => {
    sweep()
    const body = (req.body ?? {}) as Record<string, string>
    const grantType = body.grant_type
    if (grantType !== PRE_AUTH_GRANT) {
      return fail(res, 400, 'unsupported_grant_type', `walt.id issuer supports only ${PRE_AUTH_GRANT}, got ${grantType ?? 'nothing'}`)
    }

    const code = body['pre-authorized_code'] ?? body.pre_authorized_code
    const offer = code ? offers.get(code) : undefined
    if (!offer) return fail(res, 400, 'invalid_grant', 'Unknown, expired or already-redeemed pre-authorized_code')
    if (offer.redeemed) return fail(res, 400, 'invalid_grant', 'This pre-authorized_code has already been redeemed')

    offer.redeemed = true
    const accessToken = randomId(32)
    accessTokens.set(accessToken, {
      configurationId: offer.configurationId,
      subjectId: offer.subjectId,
      expiresAt: Date.now() + ACCESS_TOKEN_TTL_S * 1000,
    })

    console.log(`[waltid-issuer] Token issued for config=${offer.configurationId}`)

    res.json({
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: ACCESS_TOKEN_TTL_S,
      c_nonce: mintNonce(accessToken),
      c_nonce_expires_in: NONCE_TTL_S,
      authorization_details: [{
        type: 'openid_credential',
        credential_configuration_id: offer.configurationId,
        credential_identifiers: [offer.configurationId],
      }],
    })
  })

  function bearer(req: Request): { token: string; record: AccessTokenRecord } | null {
    const header = req.header('authorization') ?? ''
    if (!header.toLowerCase().startsWith('bearer ')) return null
    const token = header.slice(7).trim()
    const record = accessTokens.get(token)
    if (record) {
      if (record.expiresAt < Date.now()) {
        accessTokens.delete(token)
        return null
      }
      return { token, record }
    }
    return null
  }

  // ── Nonce endpoint ────────────────────────────────────────────────────────
  router.post('/nonce', (req: Request, res: Response) => {
    sweep()
    const auth = bearer(req)
    if (!auth) return fail(res, 401, 'invalid_token', 'A valid bearer access token is required')
    res.json({ c_nonce: mintNonce(auth.token), c_nonce_expires_in: NONCE_TTL_S })
  })

  // ── Credential endpoint ───────────────────────────────────────────────────
  router.post('/credential', async (req: Request, res: Response) => {
    sweep()
    const auth = bearer(req)
    if (!auth) return fail(res, 401, 'invalid_token', 'A valid bearer access token is required')

    const body = (req.body ?? {}) as Record<string, unknown>
    const requestedId = (body.credential_configuration_id ?? body.credential_identifier) as string | undefined
    const cfg = WALTID_CREDENTIAL_CONFIGS.find(c => c.id === (requestedId ?? auth.record.configurationId)) ?? WALTID_CREDENTIAL_CONFIGS[0]
    if (body.format && body.format !== cfg.format) {
      return fail(res, 400, 'unsupported_credential_format',
        `Configuration ${cfg.id} is ${cfg.format}, but the request asked for ${String(body.format)}`)
    }

    const retry = () => ({ c_nonce: mintNonce(auth.token), c_nonce_expires_in: NONCE_TTL_S })

    let holderDid: string
    let holderJwk: jose.JWK | undefined
    const proof = body.proof as { proof_type?: string; jwt?: string } | undefined
    const baseUrl = getBaseUrl(req)
    const id = `${baseUrl}${mountPath}`

    if (proof?.jwt) {
      const activeTunnel = getActiveTunnelUrl().replace(/\/$/, '')
      const validAudiences = [
        id,
        identifier,
        `${baseUrl}${mountPath}`,
        'http://localhost:3001/api/external/waltid/issuer',
        'http://127.0.0.1:3001/api/external/waltid/issuer',
        'http://inji-playground:3001/api/external/waltid/issuer',
      ]
      if (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1')) {
        validAudiences.push(`${activeTunnel}${mountPath}`)
      }
      const outcome = await validateProof(proof.jwt, validAudiences, auth.token)
      if (!outcome.ok) {
        return fail(res, 400, 'invalid_proof', outcome.description, retry())
      }
      holderDid = outcome.holderDid
      holderJwk = outcome.publicJwk
    } else {
      return fail(res, 400, 'invalid_proof', 'Credential request missing required proof of possession', retry())
    }

    console.log(`[waltid-issuer] Issuing credential format=${cfg.format} for holder=${holderDid.slice(0, 30)}...`)

    if (cfg.format === 'vc+sd-jwt') {
      const sdJwt = await issueSdJwtCredential({
        issuerKey: key,
        issuerUrl: id,
        vct: cfg.vct || 'https://walt.id/credentials/identity',
        claims: SUBJECTS[auth.record.subjectId] ?? SUBJECTS['waltid-holder-1'],
        holderDid,
        holderKey: holderJwk ? ({ publicJwk: holderJwk } as any) : undefined,
      })

      return res.json({
        credential: sdJwt.compact,
        c_nonce: mintNonce(auth.token),
        c_nonce_expires_in: NONCE_TTL_S,
      })
    }

    if (cfg.format === 'mso_mdoc') {
      const mdoc = await issueMdocCredential({
        issuerKey: key,
        issuerUrl: id,
        claims: SUBJECTS[auth.record.subjectId] ?? SUBJECTS['waltid-holder-1'],
        holderDid,
        holderKey: holderJwk ? ({ publicJwk: holderJwk } as any) : undefined,
      })

      return res.json({
        credential: mdoc.compact,
        c_nonce: mintNonce(auth.token),
        c_nonce_expires_in: NONCE_TTL_S,
      })
    }

    // ldp_vc format
    const credential = await issueLdpCredential({
      key,
      dataModel: cfg.dataModel ?? '1.1',
      credentialType: cfg.vcType,
      subject: SUBJECTS[auth.record.subjectId] ?? SUBJECTS['waltid-holder-1'],
      holderDid,
    })

    res.json({
      credential,
      c_nonce: mintNonce(auth.token),
      c_nonce_expires_in: NONCE_TTL_S,
    })
  })

  return { router, key, identifier, issuerMetadata, authorizationServerMetadata }
}
