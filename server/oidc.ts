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

import { getPublicBaseUrl } from './tunnel'

export const discoveryHandler = (req: any, res: any) => {
  const publicBase = getPublicBaseUrl(req)
  const oidcBase = `${publicBase}/api/oidc`
  res.json({
    issuer: oidcBase,
    authorization_endpoint: `${oidcBase}/authorize`,
    token_endpoint: `${oidcBase}/token`,
    jwks_uri: `${oidcBase}/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'urn:ietf:params:oauth:grant-type:pre-authorized_code'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['ES256', 'RS256'],
    scopes_supported: ['openid', 'profile', 'mock_identity_vc_ldp', 'farmer_sd_jwt', 'sample_vc_mdoc']
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

// Interactive Authorization Endpoint (Mock UI with robust auto-redirect)
oidcRouter.get('/authorize', (req, res) => {
  const { redirect_uri, state, client_id: _client_id } = req.query as Record<string, string>
  if (!redirect_uri) {
    return res.status(400).send('Missing redirect_uri')
  }

  // Generate an authorization code
  const code = 'mock_auth_code_' + Math.random().toString(36).substring(7)
  const sep = redirect_uri.includes('?') ? '&' : '?'
  const targetUrl = `${redirect_uri}${sep}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`

  // Render an HTML page that triggers client-side redirection via window.location.href
  // and provides an explicit <a> tag fallback. This ensures Android WebView's
  // onShouldStartLoadWithRequest intercepts the custom URI scheme without failing on POST 302 redirects.
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Playground OIDC</title>
      <style>
        body { font-family: system-ui, -apple-system, sans-serif; background: #0f172a; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
        .card { background: #1e293b; padding: 2rem; border-radius: 12px; border: 1px solid #334155; text-align: center; max-width: 400px; width: 100%; box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1); }
        .btn { display: inline-block; background: #f97316; color: white; text-decoration: none; padding: 0.75rem 1.5rem; border-radius: 8px; font-weight: 600; font-size: 1rem; cursor: pointer; transition: background 0.2s; width: 100%; margin-top: 1.5rem; box-sizing: border-box; }
        .btn:hover { background: #ea580c; }
        .logo { color: #f97316; font-size: 2rem; font-weight: bold; margin-bottom: 0.5rem; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">P</div>
        <h2>Playground OIDC</h2>
        <p style="color: #94a3b8; font-size: 0.875rem;">Completing authentication and returning to Inji Wallet...</p>
        <a id="auth-link" href="${targetUrl}" class="btn">Login & Authorize</a>
      </div>
      <script>
        try {
          window.location.href = "${targetUrl}";
        } catch (e) {
          console.error("Auto-redirect error:", e);
        }
      </script>
    </body>
    </html>
  `)
})
oidcRouter.get('/protocol/openid-connect/auth', (req, res) => {
  res.redirect('/api/oidc/authorize?' + new URLSearchParams(req.query as Record<string, string>).toString());
})

// Handle the mock login submission (kept for backwards compatibility)
oidcRouter.post('/authorize/submit', (req, res) => {
  const { redirect_uri, state } = req.body
  if (!redirect_uri) {
    return res.status(400).send('Missing redirect_uri')
  }
  const code = 'mock_auth_code_' + Math.random().toString(36).substring(7)
  const sep = redirect_uri.includes('?') ? '&' : '?'
  const targetUrl = `${redirect_uri}${sep}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`
  res.redirect(targetUrl)
})

// Token Endpoint
const tokenHandler = async (req: any, res: any) => {
  if (!privateKey) {
    return res.status(500).json({ error: 'server_error', error_description: 'Keys not initialized' })
  }

  const publicBase = getPublicBaseUrl(req)
  const oidcBase = `${publicBase}/api/oidc`
  const clientId = req.body?.client_id || 'wallet'
  const cNonce = `mock_c_nonce_${Date.now()}`

  // Access Token claims for Inji Certify / Local Certify
  // sub must match an 'id' in farmer_identity_data.csv (e.g. 2154189532, 8267411578, 5860356276)
  const accessTokenPayload: any = {
    sub: '2154189532',
    email: 'farmer@example.com',
    name: 'Gorge Cooper',
    scope: req.body?.scope || 'mock_identity_vc_ldp openid',
    client_id: clientId,
    c_nonce: cNonce,
    c_nonce_expires_in: 86400,
  }

  if (req.body?.wallet_jwk) {
    try {
      accessTokenPayload.cnf = { jwk: JSON.parse(req.body.wallet_jwk) }
    } catch (e) {
      console.error('[oidc] failed to parse wallet_jwk', e)
    }
  }

  const accessToken = await new jose.SignJWT(accessTokenPayload)
    .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
    .setIssuedAt()
    .setIssuer(oidcBase)
    .setAudience([
      'http://certify-nginx:80/v1/certify/issuance/credential',
      `${publicBase}/api/local-certify/issuance/credential`,
      `${publicBase}/api/local-certify`,
      clientId,
    ])
    .setExpirationTime('1h')
    .sign(privateKey)

  // Standard OIDC ID token matching discovery issuer and wallet client_id
  const idTokenPayload: any = {
    sub: '2154189532',
    email: 'farmer@example.com',
    name: 'Gorge Cooper',
  }
  const idToken = await new jose.SignJWT(idTokenPayload)
    .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
    .setIssuedAt()
    .setIssuer(oidcBase)
    .setAudience(clientId)
    .setExpirationTime('1h')
    .sign(privateKey)

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: req.body?.scope || 'mock_identity_vc_ldp',
    c_nonce: cNonce,
    c_nonce_expires_in: 86400,
    id_token: idToken,
  })
}

oidcRouter.post('/token', tokenHandler)
oidcRouter.post('/protocol/openid-connect/token', tokenHandler)
