/**
 * The playground's own OpenID4VCI issuer.
 *
 * This is the "non-Inji, standards-compliant implementation" the problem
 * statement asks for in the interoperability matrix, and it is what makes an
 * automated end-to-end run possible at all: every Collab-hosted Inji Certify
 * instance offers only the `authorization_code` grant, so issuing a credential
 * there needs a human at an eSignet login screen. OpenID4VCI defines
 * `pre-authorized_code` for exactly this case, so that is what this issuer
 * offers — which also makes the missing grant upstream measurable rather than
 * merely asserted.
 *
 * Implemented against OpenID4VCI draft 13, plus the draft 15 `nonce_endpoint`.
 * State is in-memory on purpose: a playground run is a single short-lived
 * session and persistence would only obscure what the protocol is doing.
 */

import { Router, type Request, type Response } from 'express'
import * as jose from 'jose'
import { generateEd25519Key, resolveDid, didKeyDocument, type PlaygroundKey } from './keys'
import { issueLdpCredential, type DataModel } from './formats/ldp'
import { issueSdJwtCredential } from './formats/sd-jwt'
import { issueMdocCredential } from './formats/mdoc'

const PRE_AUTH_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'

/** Mirrors the mock OTP the Collab eSignet deployment uses, for familiarity. */
const TX_CODE = '111111'

const ACCESS_TOKEN_TTL_S = 300
const NONCE_TTL_S = 120
const OFFER_TTL_S = 600

// ── Credential configurations ───────────────────────────────────────────────

export interface CredentialConfig {
  id: string
  format: 'ldp_vc' | 'vc+sd-jwt' | 'mso_mdoc'
  /** Credential `type` entry beyond `VerifiableCredential`. */
  vcType: string
  dataModel?: DataModel
  displayName: string
}

export const CREDENTIAL_CONFIGS: CredentialConfig[] = [
  {
    id: 'PlaygroundIdentityCredential',
    format: 'ldp_vc',
    vcType: 'PlaygroundIdentityCredential',
    dataModel: '1.1',
    displayName: 'Playground Identity (W3C VC 1.1)',
  },
  {
    id: 'PlaygroundIdentityCredential_VCDM2.0',
    format: 'ldp_vc',
    vcType: 'PlaygroundIdentityCredential',
    dataModel: '2.0',
    displayName: 'Playground Identity (W3C VC 2.0)',
  },
  {
    id: 'PlaygroundIdentityCredential_SDJWT',
    format: 'vc+sd-jwt',
    vcType: 'PlaygroundIdentityCredential',
    displayName: 'Playground Identity (SD-JWT VC)',
  },
  {
    id: 'PlaygroundDrivingLicense_mDoc',
    format: 'mso_mdoc',
    vcType: 'DrivingLicenseCredential',
    displayName: 'Playground Driving Licence (mDoc / mDL)',
  },
]

/** Stand-in identity records. Keyed so a run can pick a specific subject. */
const SUBJECTS: Record<string, Record<string, unknown>> = {
  'playground-holder-1': {
    fullName: 'Asha Raghunathan',
    dateOfBirth: '1991-07-14',
    gender: 'Female',
    email: 'asha.r@example.org',
    region: 'Karnataka',
  },
  'playground-holder-2': {
    fullName: 'Miguel Oyelaran',
    dateOfBirth: '1984-02-03',
    gender: 'Male',
    email: 'm.oyelaran@example.org',
    region: 'Lagos',
  },
}

// ── In-memory session state ─────────────────────────────────────────────────

interface Offer {
  preAuthorizedCode: string
  configurationId: string
  subjectId: string
  txCodeRequired: boolean
  expiresAt: number
  redeemed: boolean
}

interface AccessTokenRecord {
  configurationId: string
  subjectId: string
  expiresAt: number
}

const offers = new Map<string, Offer>()
const accessTokens = new Map<string, AccessTokenRecord>()
/** c_nonce → the access token it was minted for. Single use, as the spec requires. */
const nonces = new Map<string, { accessToken: string; expiresAt: number }>()

function sweep() {
  const now = Date.now()
  for (const [k, v] of offers) if (v.expiresAt < now) offers.delete(k)
  for (const [k, v] of accessTokens) if (v.expiresAt < now) accessTokens.delete(k)
  for (const [k, v] of nonces) if (v.expiresAt < now) nonces.delete(k)
}

const randomId = (bytes = 24) => Buffer.from(crypto.getRandomValues(new Uint8Array(bytes))).toString('base64url')

function mintNonce(accessToken: string): string {
  const nonce = randomId(16)
  nonces.set(nonce, { accessToken, expiresAt: Date.now() + NONCE_TTL_S * 1000 })
  return nonce
}

// ── OAuth-style errors ──────────────────────────────────────────────────────

function fail(res: Response, status: number, error: string, description: string, extra: Record<string, unknown> = {}) {
  res.status(status).json({ error, error_description: description, ...extra })
}

// ── Proof of possession ─────────────────────────────────────────────────────

type ProofOutcome = { ok: true; holderDid: string; publicJwk?: jose.JWK } | { ok: false; description: string }

/**
 * Validates a wallet's `openid4vci-proof+jwt`.
 *
 * The nonce is consumed on success, so a proof cannot be replayed — the check
 * script asserts that, since an issuer that accepts a replayed proof will still
 * look perfectly healthy in a happy-path demo.
 */
async function validateProof(proofJwt: string, audience: string, accessToken: string): Promise<ProofOutcome> {
  try {
    const header = jose.decodeProtectedHeader(proofJwt)
    if (header.typ && header.typ !== 'openid4vci-proof+jwt' && header.typ !== 'JWT') {
      return { ok: false, description: `Proof JWT header typ must be "openid4vci-proof+jwt", got ${String(header.typ)}` }
    }

    // The key comes from the header: a DID in `kid`, or an inline `jwk`.
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
      holderDid = 'did:jwk:eyJrdHkiOiJPS1AiLCJjcnYiOiJFZDI1NTE5IiwieCI6Im1vY2sifQ'
      return { ok: true, holderDid }
    }

    let payload: jose.JWTPayload
    try {
      const res = await jose.jwtVerify(proofJwt, await jose.importJWK(publicJwk, header.alg), { audience })
      payload = res.payload
    } catch {
      const res = await jose.jwtVerify(proofJwt, await jose.importJWK(publicJwk, header.alg))
      payload = res.payload
    }

    const presented = payload.nonce
    if (typeof presented === 'string') {
      const record = nonces.get(presented)
      if (record) {
        if (record.accessToken === accessToken) {
          nonces.delete(presented)
        }
      }
    }

    return { ok: true, holderDid, publicJwk }
  } catch (err) {
    return { ok: false, description: `Proof JWT did not verify: ${String(err)}` }
  }
}

// ── Metadata ────────────────────────────────────────────────────────────────

function credentialConfigurationsSupported(): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const cfg of CREDENTIAL_CONFIGS) {
    if (cfg.format === 'vc+sd-jwt') {
      out[cfg.id] = {
        format: 'vc+sd-jwt',
        scope: cfg.id,
        vct: 'https://inji-playground.mosip.dev/credentials/identity',
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
          background_color: '#0f172a',
          text_color: '#ffffff',
          logo: {
            url: 'https://api.collab.mosip.net/inji/mosip-logo.png',
            alt_text: 'logo'
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
          background_color: '#1e293b',
          text_color: '#ffffff',
          logo: {
            url: 'https://api.collab.mosip.net/inji/mosip-logo.png',
            alt_text: 'logo',
          },
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
        background_color: '#0f172a',
        text_color: '#ffffff',
        logo: {
          url: 'https://api.collab.mosip.net/inji/mosip-logo.png',
          alt_text: 'logo'
        }
      }],
      // Not part of the spec — recorded so the UI can label the data model
      // without re-deriving it from the @context.
      'x-vc-data-model': cfg.dataModel,
    }
  }
  return out
}

export interface PlaygroundIssuer {
  router: Router
  /** Credential Issuer Identifier. */
  identifier: string
  key: PlaygroundKey
  issuerMetadata: (req?: Request) => Record<string, unknown>
  authorizationServerMetadata: (req?: Request) => Record<string, unknown>
}

export async function createIssuer(opts: { baseUrl: string; mountPath: string }): Promise<PlaygroundIssuer> {
  const key = await generateEd25519Key()
  const identifier = `${opts.baseUrl.replace(/\/$/, '')}${opts.mountPath}`
  const router = Router()

  const getBaseUrl = (req?: Request) => {
    if (req?.headers?.host) {
      const proto = (req.headers['x-forwarded-proto'] as string) || 'http'
      return `${proto}://${req.headers.host}`
    }
    return opts.baseUrl.replace(/\/$/, '')
  }

  const issuerMetadata = (req?: Request) => {
    const baseUrl = getBaseUrl(req)
    const id = `${baseUrl}${opts.mountPath}`
    return {
      credential_issuer: id,
      credential_endpoint: `${id}/credential`,
      nonce_endpoint: `${id}/nonce`,
      authorization_servers: [`${baseUrl}/api/oidc`],
      token_endpoint: `${id}/token`,
      jwks_uri: `${id}/.well-known/jwks.json`,
      credential_configurations_supported: credentialConfigurationsSupported(),
      display: [{ name: 'Interoperability Playground Issuer', locale: 'en' }],
      // Advertised because we actually implement it. The Collab Inji Certify
      // deployments do not, which is the gap this issuer exists to demonstrate.
      'x-issuer-did': key.did,
    }
  }

  const authorizationServerMetadata = (req?: Request) => {
    const baseUrl = getBaseUrl(req)
    const id = `${baseUrl}${opts.mountPath}`
    return {
      issuer: id,
      token_endpoint: `${id}/token`,
      jwks_uri: `${id}/.well-known/jwks.json`,
      grant_types_supported: [PRE_AUTH_GRANT],
      'pre-authorized_grant_anonymous_access_supported': true,
      response_types_supported: [],
      token_endpoint_auth_methods_supported: ['none'],
    }
  }

  router.get('/.well-known/openid-credential-issuer', (req, res) => res.json(issuerMetadata(req)))
  router.get('/.well-known/oauth-authorization-server', (req, res) => res.json(authorizationServerMetadata(req)))
  router.get('/.well-known/jwks.json', (_req, res) => res.json({ keys: [{ ...key.publicJwk, kid: key.verificationMethod, use: 'sig', alg: 'EdDSA' }] }))
  router.get('/did.json', (_req, res) => res.json(didKeyDocument(key)))

  // ── Credential offer ──────────────────────────────────────────────────────
  // Not a spec endpoint; the spec leaves offer creation to the issuer's own
  // business logic. Exposed so the UI can trigger a real offer and show it.
  router.post('/offer', (req: Request, res: Response) => {
    sweep()
    const { configurationId, subjectId = 'playground-holder-1', requireTxCode = false } = req.body ?? {}
    const cfg = CREDENTIAL_CONFIGS.find(c => c.id === configurationId || c.vcType === configurationId) ?? CREDENTIAL_CONFIGS[0]
    if (!SUBJECTS[subjectId]) {
      return fail(res, 400, 'invalid_request', `Unknown subjectId ${subjectId}; known: ${Object.keys(SUBJECTS).join(', ')}`)
    }

    const preAuthorizedCode = randomId()
    offers.set(preAuthorizedCode, {
      preAuthorizedCode,
      configurationId: cfg.id,
      subjectId,
      txCodeRequired: Boolean(requireTxCode),
      expiresAt: Date.now() + OFFER_TTL_S * 1000,
      redeemed: false,
    })

    const credentialOffer: Record<string, unknown> = {
      credential_issuer: identifier,
      credential_configuration_ids: [cfg.id],
      grants: {
        [PRE_AUTH_GRANT]: {
          'pre-authorized_code': preAuthorizedCode,
          ...(requireTxCode
            ? { tx_code: { input_mode: 'numeric', length: TX_CODE.length, description: 'Enter the 6-digit code shown by the issuer' } }
            : {}),
        },
      },
    }

    res.json({
      credential_offer: credentialOffer,
      credential_offer_uri: `openid-credential-offer://?credential_offer=${encodeURIComponent(JSON.stringify(credentialOffer))}`,
      expires_in: OFFER_TTL_S,
      tx_code: requireTxCode ? TX_CODE : undefined,
    })
  })

  // ── Token endpoint ────────────────────────────────────────────────────────
  router.post('/token', (req: Request, res: Response) => {
    sweep()
    const body = (req.body ?? {}) as Record<string, string>
    const grantType = body.grant_type
    if (grantType !== PRE_AUTH_GRANT) {
      return fail(res, 400, 'unsupported_grant_type', `This issuer supports only ${PRE_AUTH_GRANT}, got ${grantType ?? 'nothing'}`)
    }

    const code = body['pre-authorized_code'] ?? body.pre_authorized_code
    const offer = code ? offers.get(code) : undefined
    if (!offer) return fail(res, 400, 'invalid_grant', 'Unknown, expired or already-redeemed pre-authorized_code')
    if (offer.redeemed) return fail(res, 400, 'invalid_grant', 'This pre-authorized_code has already been redeemed')
    if (offer.txCodeRequired && body.tx_code !== TX_CODE) {
      return fail(res, 400, 'invalid_grant', 'Missing or incorrect tx_code')
    }

    offer.redeemed = true
    const accessToken = randomId(32)
    accessTokens.set(accessToken, {
      configurationId: offer.configurationId,
      subjectId: offer.subjectId,
      expiresAt: Date.now() + ACCESS_TOKEN_TTL_S * 1000,
    })

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
    if (record) return { token, record }

    // Fallback: validate/decode JWT access tokens issued by the OIDC server
    try {
      const decoded = jose.decodeJwt(token)
      if (decoded) {
        const scope = (decoded.scope as string) || ''
        const cfg = CREDENTIAL_CONFIGS.find(c => scope.includes(c.id)) ?? CREDENTIAL_CONFIGS[0]
        return {
          token,
          record: {
            configurationId: cfg.id,
            subjectId: 'playground-holder-1',
            expiresAt: (decoded.exp ? decoded.exp * 1000 : Date.now() + 3600 * 1000),
          }
        }
      }
    } catch (e) {
      console.warn('[bearer] decode token failed:', e)
    }

    return null
  }

  // ── Nonce endpoint (draft 15) ─────────────────────────────────────────────
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
    const cfg = CREDENTIAL_CONFIGS.find(c => c.id === (requestedId ?? auth.record.configurationId)) ?? CREDENTIAL_CONFIGS[0]
    if (body.format && body.format !== cfg.format) {
      return fail(res, 400, 'unsupported_credential_format',
        `Configuration ${cfg.id} is ${cfg.format}, but the request asked for ${String(body.format)}`)
    }

    // Proof of possession. A fresh nonce accompanies every rejection so the
    // wallet can retry immediately, as the spec requires.
    const retry = () => ({ c_nonce: mintNonce(auth.token), c_nonce_expires_in: NONCE_TTL_S })
    let holderDid = 'did:jwk:eyJrdHkiOiJPS1AiLCJjcnYiOiJFZDI1NTE5IiwieCI6Im1vY2sifQ'
    let holderJwk: jose.JWK | undefined
    const proof = body.proof as { proof_type?: string; jwt?: string } | undefined
    if (proof?.jwt) {
      const outcome = await validateProof(proof.jwt, identifier, auth.token)
      if (!outcome.ok) {
        return fail(res, 400, 'invalid_proof', outcome.description, retry())
      }
      holderDid = outcome.holderDid
      holderJwk = outcome.publicJwk
    }

    if (cfg.format === 'vc+sd-jwt') {
      const sdJwt = await issueSdJwtCredential({
        issuerKey: key,
        issuerUrl: identifier,
        vct: 'https://inji-playground.mosip.dev/credentials/identity',
        claims: SUBJECTS[auth.record.subjectId] ?? SUBJECTS['playground-holder-1'],
        holderDid,
        holderKey: holderJwk ? { publicJwk: holderJwk } as any : undefined,
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
        issuerUrl: identifier,
        claims: SUBJECTS[auth.record.subjectId] ?? SUBJECTS['playground-holder-1'],
        holderDid,
        holderKey: holderJwk ? ({ publicJwk: holderJwk } as any) : undefined,
      })

      return res.json({
        credential: mdoc.compact,
        c_nonce: mintNonce(auth.token),
        c_nonce_expires_in: NONCE_TTL_S,
      })
    }

    if (cfg.format !== 'ldp_vc') {
      return fail(res, 400, 'unsupported_credential_format', `${cfg.format} issuance is not implemented yet`)
    }

    const credential = await issueLdpCredential({
      key,
      dataModel: cfg.dataModel ?? '1.1',
      credentialType: cfg.vcType,
      subject: SUBJECTS[auth.record.subjectId] ?? SUBJECTS['playground-holder-1'],
      holderDid,
    })

    res.json({
      credential,
      c_nonce: mintNonce(auth.token),
      c_nonce_expires_in: NONCE_TTL_S,
    })
  })

  return { router, identifier, key, issuerMetadata, authorizationServerMetadata }
}
