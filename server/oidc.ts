import { Router, type Request, type Response } from 'express'
import crypto from 'crypto'
import * as jose from 'jose'
import { getPublicBaseUrl } from './tunnel'
import { notifyFlowStep } from './events/flow-events'

export const oidcRouter = Router()

// Generate an EC keypair for signing OIDC tokens (ES256)
let privateKey: any = null
let jwk: Record<string, unknown> | null = null
const KEY_ID = 'playground-oidc-key-1'

export async function initKeys() {
  const { publicKey: pk, privateKey: sk } = await jose.generateKeyPair('ES256')
  privateKey = sk
  jwk = await jose.exportJWK(pk)
  jwk.kid = KEY_ID
  jwk.use = 'sig'
  jwk.alg = 'ES256'
  return { privateKey, jwk }
}

const keyInitPromise = initKeys().catch(console.error)

export async function ensureKeys() {
  if (!privateKey) {
    await keyInitPromise
  }
  return { privateKey, jwk }
}

export { FARMER_IDENTITIES, type FarmerProfile } from './oidc/profiles'
import { FARMER_IDENTITIES, type FarmerProfile } from './oidc/profiles'
import { renderConsentHtml } from './oidc/consent-template'

// In-Memory Session Stores for RFC 7636 PKCE & Pre-Auth Codes
export interface AuthSession {
  code: string
  clientId: string
  redirectUri: string
  codeChallenge?: string
  codeChallengeMethod?: string
  sub: string
  scope: string
  state?: string
  expiresAt: number
}

const authSessions = new Map<string, AuthSession>()
const preAuthRegistry = new Map<string, { sub: string; createdAt: number }>()

export function registerPreAuthCode(code: string, sub: string = '2154189532') {
  preAuthRegistry.set(code, { sub, createdAt: Date.now() })
}

// Periodic cleanup of expired authorization sessions (older than 10 minutes)
const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [code, session] of authSessions.entries()) {
    if (session.expiresAt < now) authSessions.delete(code)
  }
  for (const [code, entry] of preAuthRegistry.entries()) {
    if (now - entry.createdAt > 3600000) preAuthRegistry.delete(code)
  }
}, 60000)
cleanupTimer.unref()

export const discoveryHandler = (req: Request, res: Response) => {
  const publicBase = getPublicBaseUrl(req)
  const oidcBase = `${publicBase}/api/oidc`
  res.json({
    issuer: oidcBase,
    authorization_endpoint: `${oidcBase}/authorize`,
    token_endpoint: `${oidcBase}/token`,
    userinfo_endpoint: `${oidcBase}/userinfo`,
    jwks_uri: `${oidcBase}/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'urn:ietf:params:oauth:grant-type:pre-authorized_code'],
    code_challenge_methods_supported: ['S256', 'plain'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['ES256', 'RS256'],
    scopes_supported: [
      'openid',
      'profile',
      'email',
      'phone',
      'mock_identity_vc_ldp',
      'farmer_sd_jwt',
      'sample_vc_mdoc',
    ],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  })
}

oidcRouter.get('/.well-known/openid-configuration', discoveryHandler)
oidcRouter.get('/.well-known/oauth-authorization-server', discoveryHandler)

oidcRouter.get('/jwks', async (_req, res) => {
  await ensureKeys()
  res.json({
    keys: jwk ? [jwk] : [],
  })
})

oidcRouter.get('/protocol/openid-connect/certs', async (_req, res) => {
  await ensureKeys()
  res.json({
    keys: jwk ? [jwk] : [],
  })
})

// Helper to create an authorization code
function createAuthorizationCode(
  clientId: string,
  redirectUri: string,
  sub: string,
  scope: string,
  codeChallenge?: string,
  codeChallengeMethod?: string,
  state?: string
): string {
  const code = 'auth_code_' + crypto.randomBytes(16).toString('hex')
  authSessions.set(code, {
    code,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod: codeChallengeMethod || (codeChallenge ? 'plain' : undefined),
    sub,
    scope,
    state,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  })
  return code
}

// Executive MOSIP-Themed Interactive Citizen Authorization Endpoint
oidcRouter.get('/authorize', (req: Request, res: Response) => {
  const {
    redirect_uri,
    state,
    client_id = 'wallet',
    scope = 'openid profile mock_identity_vc_ldp',
    code_challenge,
    code_challenge_method = 'S256',
    sub = '2154189532',
    auto,
  } = req.query as Record<string, string>

  if (!redirect_uri) {
    return res.status(400).send('Missing redirect_uri parameter')
  }

  // Headless bypass or automated parameter requested
  if (auto === 'true') {
    const code = createAuthorizationCode(
      client_id,
      redirect_uri,
      sub,
      scope,
      code_challenge,
      code_challenge_method,
      state
    )
    const sep = redirect_uri.includes('?') ? '&' : '?'
    const targetUrl = `${redirect_uri}${sep}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`
    return res.redirect(targetUrl)
  }

  const farmerList = Object.values(FARMER_IDENTITIES)
  const defaultFarmer = FARMER_IDENTITIES[sub] || FARMER_IDENTITIES['2154189532']

  res.send(
    renderConsentHtml({
      clientId: client_id,
      redirectUri: redirect_uri,
      scope,
      codeChallenge: code_challenge,
      codeChallengeMethod: code_challenge_method,
      state,
      farmerList,
      defaultFarmer,
    })
  )
})

// Programmatic / POST Consent Handler
oidcRouter.post('/authorize/consent', (req: Request, res: Response) => {
  const {
    client_id = 'wallet',
    redirect_uri,
    scope = 'openid profile mock_identity_vc_ldp',
    code_challenge,
    code_challenge_method = 'S256',
    state,
    sub = '2154189532',
  } = req.body || {}

  if (!redirect_uri) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'Missing redirect_uri' })
  }

  const code = createAuthorizationCode(
    client_id,
    redirect_uri,
    sub,
    scope,
    code_challenge,
    code_challenge_method,
    state
  )

  const sep = redirect_uri.includes('?') ? '&' : '?'
  const redirect_url = `${redirect_uri}${sep}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`

  res.json({
    code,
    redirect_url,
    state: state || null,
    sub,
  })
})

oidcRouter.get('/protocol/openid-connect/auth', (req: Request, res: Response) => {
  res.redirect('/api/oidc/authorize?' + new URLSearchParams(req.query as Record<string, string>).toString())
})

// Backwards-compatible legacy submit
oidcRouter.post('/authorize/submit', (req: Request, res: Response) => {
  const { redirect_uri, state, sub = '2154189532' } = req.body || {}
  if (!redirect_uri) {
    return res.status(400).send('Missing redirect_uri')
  }
  const code = createAuthorizationCode('wallet', redirect_uri, sub, 'openid profile')
  const sep = redirect_uri.includes('?') ? '&' : '?'
  const targetUrl = `${redirect_uri}${sep}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`
  res.redirect(targetUrl)
})

// OAuth 2.0 / OpenID Connect Token Endpoint with RFC 7636 PKCE Verification
const tokenHandler = async (req: Request, res: Response) => {
  await ensureKeys()
  if (!privateKey) {
    return res.status(500).json({ error: 'server_error', error_description: 'Signing keys not initialized' })
  }

  const publicBase = getPublicBaseUrl(req)
  const oidcBase = `${publicBase}/api/oidc`
  const clientId = req.body?.client_id || 'wallet'
  const grantType = req.body?.grant_type || 'authorization_code'
  const cNonce = `cnonce_${crypto.randomBytes(12).toString('hex')}`

  let selectedSub = '2154189532'
  let matchedScope = req.body?.scope || 'mock_identity_vc_ldp openid'

  // 1. Authorization Code Grant (with RFC 7636 PKCE)
  if (grantType === 'authorization_code') {
    const code = req.body?.code
    if (!code) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Missing authorization code' })
    }

    const session = authSessions.get(code)
    if (!session || session.expiresAt < Date.now()) {
      if (session) authSessions.delete(code)
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Authorization code is invalid or has expired',
      })
    }

    // PKCE verification
    if (session.codeChallenge) {
      const codeVerifier = req.body?.code_verifier
      if (!codeVerifier) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'PKCE code_verifier is required for this authorization code',
        })
      }

      if (session.codeChallengeMethod === 'S256') {
        const computed = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
        if (computed !== session.codeChallenge) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'PKCE code_verifier verification failed (S256 mismatch)',
          })
        }
      } else if (session.codeChallengeMethod === 'plain') {
        if (codeVerifier !== session.codeChallenge) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'PKCE code_verifier verification failed (plain mismatch)',
          })
        }
      }
    }

    selectedSub = session.sub
    matchedScope = session.scope || matchedScope

    // Enforce single-use authorization code (RFC 6749 §4.1.2)
    authSessions.delete(code)
  }
  // 2. Pre-Authorized Code Grant (OpenID4VCI Draft 13 §4.1)
  else if (
    grantType === 'urn:ietf:params:oauth:grant-type:pre-authorized_code' ||
    grantType === 'pre-authorized_code'
  ) {
    const preAuthCode = req.body?.['pre-authorized_code'] || req.body?.code
    if (preAuthCode && preAuthRegistry.has(preAuthCode)) {
      selectedSub = preAuthRegistry.get(preAuthCode)!.sub
      preAuthRegistry.delete(preAuthCode)
    }
  }

  const identity: FarmerProfile = FARMER_IDENTITIES[selectedSub] || FARMER_IDENTITIES['2154189532']

  // Access Token payload aligned with Inji Certify CSV Data Provider Plugin
  const accessTokenPayload: Record<string, unknown> = {
    sub: identity.id,
    name: identity.fullName,
    email: `${identity.fullName.toLowerCase().replace(/\\s+/g, '.')}@example.com`,
    phone_number: identity.mobileNumber,
    gender: identity.gender,
    birthdate: identity.dateOfBirth,
    zoneinfo: `${identity.district}, ${identity.state}`,
    scope: matchedScope,
    client_id: clientId,
    c_nonce: cNonce,
    c_nonce_expires_in: 86400,
  }

  // Key-binding confirmation (cnf)
  if (req.body?.wallet_jwk) {
    try {
      accessTokenPayload.cnf = { jwk: JSON.parse(req.body.wallet_jwk) }
    } catch (e) {
      console.error('[oidc] failed to parse wallet_jwk', e)
    }
  }

  const allowedAudiences = [
    'http://certify-nginx:80/v1/certify/issuance/credential',
    'http://localhost:3001/api/local-certify/issuance/credential',
    'http://host.docker.internal:3001/api/local-certify/issuance/credential',
    `${publicBase}/api/local-certify/issuance/credential`,
    `${publicBase}/api/local-certify`,
    clientId,
  ]

  const accessToken = await new jose.SignJWT(accessTokenPayload)
    .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
    .setIssuedAt()
    .setIssuer(oidcBase)
    .setAudience(allowedAudiences)
    .setExpirationTime('1h')
    .sign(privateKey)

  // Standard OIDC ID Token
  const idTokenPayload = {
    sub: identity.id,
    name: identity.fullName,
    email: `${identity.fullName.toLowerCase().replace(/\\s+/g, '.')}@example.com`,
    phone_number: identity.mobileNumber,
    gender: identity.gender,
    birthdate: identity.dateOfBirth,
  }

  const idToken = await new jose.SignJWT(idTokenPayload)
    .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
    .setIssuedAt()
    .setIssuer(oidcBase)
    .setAudience(clientId)
    .setExpirationTime('1h')
    .sign(privateKey)

  notifyFlowStep('token-exchange', 'done', {
    source: 'live_mobile',
    sub: identity.id,
    grantType,
  })

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: matchedScope,
    c_nonce: cNonce,
    c_nonce_expires_in: 86400,
    id_token: idToken,
  })
}

oidcRouter.post('/token', tokenHandler)
oidcRouter.post('/protocol/openid-connect/token', tokenHandler)

// OpenID Connect UserInfo Endpoint
oidcRouter.get('/userinfo', async (req: Request, res: Response) => {
  await ensureKeys()
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', error_description: 'Missing or invalid Bearer token' })
  }

  const token = authHeader.substring(7)
  try {
    const { payload } = await jose.jwtVerify(token, jwk as any, { algorithms: ['ES256'] })
    const sub = String(payload.sub || '2154189532')
    const identity = FARMER_IDENTITIES[sub] || FARMER_IDENTITIES['2154189532']

    res.json({
      sub: identity.id,
      name: identity.fullName,
      email: `${identity.fullName.toLowerCase().replace(/\\s+/g, '.')}@example.com`,
      phone_number: identity.mobileNumber,
      gender: identity.gender,
      birthdate: identity.dateOfBirth,
      address: {
        locality: identity.villageOrTown,
        region: identity.state,
        postal_code: identity.postalCode,
        country: 'India',
      },
      farmer_details: {
        land_area: identity.landArea,
        ownership: identity.landOwnershipType,
        primary_crop: identity.primaryCropType,
        secondary_crop: identity.secondaryCropType,
      },
    })
  } catch {
    return res.status(401).json({ error: 'invalid_token', error_description: 'Token validation failed' })
  }
})
