import { Router } from 'express'
import * as jose from 'jose'

export const oidcRouter = Router()

// Generate an EC keypair for signing OIDC tokens (ES256)
let privateKey: unknown = null
let jwk: Record<string, unknown> | null = null
const KEY_ID = 'playground-oidc-key-1'

async function initKeys() {
  const { publicKey: pk, privateKey: sk } = await jose.generateKeyPair('ES256')
  privateKey = sk
  jwk = await jose.exportJWK(pk)
  jwk.kid = KEY_ID
  jwk.use = 'sig'
  jwk.alg = 'ES256'
}

initKeys().catch(console.error)

// The internal Docker issuer URI — used as the JWT 'iss' claim so Certify
// (inside Docker) can resolve it to fetch the JWKS for token validation.
const DOCKER_ISSUER_URI = 'http://host.docker.internal:3001/api/oidc'

// Dynamic helper — returns the base URL as seen by the requester.
// When called from the browser, this returns localhost:3001.
// When called from Certify inside Docker (for JWKS), it returns host.docker.internal:3001.
function getIssuerUri(req: any): string {
  const host = req.headers.host || 'localhost:3001'
  return `http://${host}/api/oidc`
}

const discoveryHandler = (req: any, res: any) => {
  const issuer = getIssuerUri(req)
  res.json({
    issuer,
    authorization_endpoint: 'http://localhost:3001/api/oidc/authorize',
    token_endpoint: `${issuer}/token`,
    jwks_uri: `${issuer}/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'urn:ietf:params:oauth:grant-type:pre-authorized_code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
    scopes_supported: ['openid', 'profile']
  })
}

oidcRouter.get('/.well-known/openid-configuration', discoveryHandler)
oidcRouter.get('/.well-known/oauth-authorization-server', discoveryHandler)

oidcRouter.get('/jwks', (_req, res) => {
  res.json({
    keys: jwk ? [jwk] : []
  })
})
oidcRouter.get('/protocol/openid-connect/certs', (_req, res) => {
  res.json({
    keys: jwk ? [jwk] : []
  })
})

// Interactive Authorization Endpoint (Mock UI)
oidcRouter.get('/authorize', (req, res) => {
  const { redirect_uri, state, client_id } = req.query
  if (!redirect_uri) {
    return res.status(400).send('Missing redirect_uri')
  }
  
  // A sleek, minimal login UI that mimics a real IDP but takes 1 click.
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Playground eSignet (Mock)</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: #1e293b; padding: 2rem; border-radius: 12px; border: 1px solid #334155; text-align: center; max-width: 400px; width: 100%; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1); }
        .btn { background: #f97316; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; font-size: 1rem; cursor: pointer; transition: background 0.2s; width: 100%; margin-top: 1.5rem; }
        .btn:hover { background: #ea580c; }
        .logo { color: #f97316; font-size: 2rem; font-weight: bold; margin-bottom: 0.5rem; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">P</div>
        <h2>Playground OIDC</h2>
        <p style="color: #94a3b8; font-size: 0.875rem;">You are authenticating to a local mock identity provider.</p>
        <form method="POST" action="/api/oidc/authorize/submit">
          <input type="hidden" name="redirect_uri" value="${redirect_uri}">
          <input type="hidden" name="state" value="${state || ''}">
          <input type="hidden" name="client_id" value="${client_id || ''}">
          <button type="submit" class="btn">Login & Authorize</button>
        </form>
      </div>
    </body>
    </html>
  `)
})
oidcRouter.get('/protocol/openid-connect/auth', (req, res) => {
  res.redirect('/api/oidc/authorize?' + new URLSearchParams(req.query as Record<string, string>).toString());
})

// Handle the mock login submission
oidcRouter.post('/authorize/submit', (req, res) => {
  const { redirect_uri, state } = req.body
  // Generate a fake auth code
  const code = 'mock_auth_code_' + Math.random().toString(36).substring(7)
  const url = new URL(redirect_uri)
  url.searchParams.set('code', code)
  if (state) url.searchParams.set('state', state)
  res.redirect(url.toString())
})

// Token Endpoint
const tokenHandler = async (req: any, res: any) => {
  if (!privateKey) {
    return res.status(500).json({ error: 'server_error', error_description: 'Keys not initialized' })
  }
  
  const cNonce = `mock_c_nonce_${Date.now()}`
  
  // Issue a standard JWT Access Token that Inji Certify will validate.
  // IMPORTANT: sub must match an 'id' in the farmer_identity_data.csv (e.g. 2154189532, 8267411578, 5860356276)
  // The CSV data provider plugin looks up the farmer record by sub claim.
  const jwtPayload: any = {
    sub: '2154189532',  // Gorge Cooper - matches CSV id column
    email: 'farmer@example.com',
    name: 'Gorge Cooper',
    scope: 'mock_identity_vc_ldp openid',
    client_id: 'playground-local-client',
    c_nonce: cNonce, // Certify validates the Proof JWT nonce against this claim
    c_nonce_expires_in: 86400
  }
  
  console.log('[oidc] req.body?.wallet_jwk =', req.body?.wallet_jwk)
  if (req.body?.wallet_jwk) {
    try {
      jwtPayload.cnf = { jwk: JSON.parse(req.body.wallet_jwk) }
    } catch (e) {
      console.error('[oidc] failed to parse wallet_jwk', e)
    }
  }

  const jwt = await new jose.SignJWT(jwtPayload)
    .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
    .setIssuedAt()
    .setIssuer(DOCKER_ISSUER_URI)
    // Certify (running with mosip_certify_domain_url=http://certify-nginx:80) validates
    // the access token audience against http://certify-nginx:80/v1/certify/issuance/credential
    // This is set by: mosip.certify.oauth.access-token.audience = ${mosip.certify.identifier}/v1/certify/issuance/credential
    .setAudience('http://certify-nginx:80/v1/certify/issuance/credential')
    .setExpirationTime('1h')
    .sign(privateKey)

  res.json({
    access_token: jwt,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'mock_identity_vc_ldp',
    c_nonce: cNonce,
    c_nonce_expires_in: 86400,
    id_token: jwt // some clients expect id_token too
  })
}

oidcRouter.post('/token', tokenHandler)
oidcRouter.post('/protocol/openid-connect/token', tokenHandler)
