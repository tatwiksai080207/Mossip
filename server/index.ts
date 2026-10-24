import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { createIssuer } from './issuer'
import { createWallet } from './wallet'
import { oidcRouter, discoveryHandler } from './oidc'
import { waltidVerifierRouter } from './external/waltid'
import { createWaltIdIssuer } from './external/waltid-issuer'
import { sphereonVerifierRouter } from './external/sphereon-verifier'
import { createSphereonIssuer } from './external/sphereon-issuer'
import { createSphereonWallet } from './external/sphereon-wallet'
import { getPublicBaseUrl, getActiveTunnelUrl, setTunnelUrl } from './tunnel'
import { ENDPOINTS, PROXIES, VERIFY } from './endpoints'
import { tamperRouter, getActiveTamperMode, applyTamperingToVpToken } from './tamper'
import { verifierRouter } from './routes/verifier-routes'
import { createMimotoRouter } from './routes/mimoto-routes'
import { createCertifyRouter } from './routes/certify-routes'
import { registryRouter } from './routes/registry-routes'
import { keycloakMockRouter } from './routes/keycloak-mock'
import { standardProxyRouter } from './routes/proxy-routes'
import { diagnosticsRouter } from './routes/diagnostics-routes'
import { createFlowEventsRouter } from './events/flow-events'
import { errorHandlerMiddleware } from './errors'
import { env } from './config/env'
import { getResidentIdentity } from './config/identities'

export { getPublicBaseUrl, getActiveTamperMode, applyTamperingToVpToken, VERIFY }

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.set('etag', false)
const PORT = env.port

const PUBLIC_BASE_URL = getPublicBaseUrl()
const ISSUER_MOUNT = '/api/playground-issuer'
const WALTID_ISSUER_MOUNT = '/api/external/waltid/issuer'
const SPHEREON_ISSUER_MOUNT = '/api/external/sphereon/issuer'

app.use((req, res, next) => {
  res.setHeader('ngrok-skip-browser-warning', 'true')
  console.log('[HTTP]', req.method, req.url)
  next()
})
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true, limit: '5mb' }))

// ── Core Services Initialization ────────────────────────────────────────────
// 1. The playground's own OpenID4VCI issuer
const playgroundIssuer = await createIssuer({ baseUrl: PUBLIC_BASE_URL, mountPath: ISSUER_MOUNT })
app.use(ISSUER_MOUNT, playgroundIssuer.router)
app.get(`/.well-known/openid-credential-issuer${ISSUER_MOUNT}`, (req, res) => {
  res.json(playgroundIssuer.issuerMetadata(req))
})
app.get(`/.well-known/oauth-authorization-server${ISSUER_MOUNT}`, (req, res) => {
  res.json(playgroundIssuer.authorizationServerMetadata(req))
})

// 2. The playground's holder wallet
const playgroundWallet = await createWallet()
app.use('/api/wallet', playgroundWallet.router)

// 3. Local Certify proxy & mock routes
const certify = await createCertifyRouter()
app.use(certify.router)

// 4. Mimoto & wallet bridge routes
const mimotoRouter = createMimotoRouter({ playgroundIssuer, playgroundWallet })
app.use(mimotoRouter)

// 5. OIDC Server routes
app.use('/api/oidc', oidcRouter)
app.get(
  ['/.well-known/oauth-authorization-server/api/oidc', '/.well-known/openid-configuration/api/oidc'],
  discoveryHandler
)

// 6. External Reference Integrations (walt.id & Sphereon)
app.use('/api/external/waltid/verifier', waltidVerifierRouter)
const waltIdIssuer = await createWaltIdIssuer({ baseUrl: PUBLIC_BASE_URL, mountPath: WALTID_ISSUER_MOUNT })
app.use(WALTID_ISSUER_MOUNT, waltIdIssuer.router)
app.get(`/.well-known/openid-credential-issuer${WALTID_ISSUER_MOUNT}`, (req, res) => {
  res.json(waltIdIssuer.issuerMetadata(req))
})
app.get(`/.well-known/oauth-authorization-server${WALTID_ISSUER_MOUNT}`, (req, res) => {
  res.json(waltIdIssuer.authorizationServerMetadata(req))
})

// 6b. Sphereon Suite (Verifier, Issuer, Wallet)
app.use('/api/external/sphereon/verifier', sphereonVerifierRouter)
const sphereonIssuer = await createSphereonIssuer({ baseUrl: PUBLIC_BASE_URL, mountPath: SPHEREON_ISSUER_MOUNT })
app.use(SPHEREON_ISSUER_MOUNT, sphereonIssuer.router)
app.get(`/.well-known/openid-credential-issuer${SPHEREON_ISSUER_MOUNT}`, (req, res) => {
  res.json(sphereonIssuer.issuerMetadata(req))
})
app.get(`/.well-known/oauth-authorization-server${SPHEREON_ISSUER_MOUNT}`, (req, res) => {
  res.json(sphereonIssuer.authorizationServerMetadata(req))
})

const sphereonWallet = await createSphereonWallet()
app.use('/api/external/sphereon/wallet', sphereonWallet.router)

// 7. Route Modules
app.use('/api/tamper', tamperRouter)
app.use(verifierRouter)
app.use(keycloakMockRouter)
app.use(standardProxyRouter)
app.use(registryRouter)
app.use(diagnosticsRouter)
app.use(createFlowEventsRouter())

// ── OAuth 2.0 Callback Endpoint ─────────────────────────────────────────────
app.get('/callback', (req, res) => {
  const code = (req.query.code as string) || ''
  const error = (req.query.error as string) || ''

  if (error) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <title>Authentication Error</title>
        <style>
          body { background: #090d16; color: #f8fafc; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
          .card { background: #0f172a; border: 1px solid #dc2626; border-radius: 12px; padding: 24px; max-width: 400px; text-align: center; }
          h2 { color: #f87171; margin-bottom: 8px; }
          p { color: #94a3b8; font-size: 0.9rem; }
        </style>
      </head>
      <body>
        <div class="card">
          <h2>Authorization Failed</h2>
          <p>${error}: ${req.query.error_description || 'Unknown error'}</p>
        </div>
      </body>
      </html>
    `)
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Authentication Successful | MOSIP eSignet</title>
      <style>
        body { background: #090d16; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box; }
        .card { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; padding: 32px; max-width: 460px; width: 100%; text-align: center; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6); }
        .icon { width: 56px; height: 56px; border-radius: 50%; background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px; color: #34d399; }
        h1 { font-size: 1.25rem; font-weight: 700; margin-bottom: 8px; color: #ffffff; }
        p { font-size: 0.85rem; color: #94a3b8; line-height: 1.5; margin-bottom: 20px; }
        .code-box { background: #1e293b; border: 1px solid #334155; border-radius: 8px; padding: 12px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
        .code-text { font-family: monospace; font-size: 0.82rem; color: #38bdf8; word-break: break-all; text-align: left; }
        .btn { background: #2563eb; color: white; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; font-size: 0.85rem; cursor: pointer; transition: background 0.2s; width: 100%; }
        .btn:hover { background: #1d4ed8; }
        .btn-copy { background: #334155; padding: 6px 12px; width: auto; font-size: 0.75rem; }
        .btn-copy:hover { background: #475569; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="icon">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        </div>
        <h1>Authentication Successful</h1>
        <p>Your citizen identity has been verified via RFC 7636 PKCE. You can copy the code below or return to the Inji Playground.</p>
        <div class="code-box">
          <span class="code-text" id="code-val">${code}</span>
          <button class="btn btn-copy" onclick="copyCode()">Copy</button>
        </div>
        <button class="btn" onclick="window.close()">Close Window</button>
      </div>
      <script>
        const code = "${code}";
        if (window.opener) {
          try {
            window.opener.postMessage({ type: 'OAUTH_CODE', code: code, url: window.location.href }, '*');
          } catch(e) {}
        }
        function copyCode() {
          navigator.clipboard.writeText(code);
          alert('Authorization code copied to clipboard!');
        }
      </script>
    </body>
    </html>
  `)
})

// ── Health & Tunnel Management ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  const base = getPublicBaseUrl(req)
  res.json({
    status: 'ok',
    endpoints: ENDPOINTS,
    playgroundIssuer: `${base}${ISSUER_MOUNT}`,
    tunnelUrl: getActiveTunnelUrl(),
  })
})

app.get('/api/tunnel', (_req, res) => {
  res.json({ tunnelUrl: getActiveTunnelUrl() })
})

app.get('/api/identities/resident', (_req, res) => {
  res.json(getResidentIdentity())
})

app.post('/api/tunnel', (req, res) => {
  if (req.body?.tunnelUrl) {
    const url = setTunnelUrl(req.body.tunnelUrl)
    console.log('[tunnel] Updated activeTunnelUrl to:', url)
  }
  res.json({ tunnelUrl: getActiveTunnelUrl() })
})

// ── Frontend Routing ────────────────────────────────────────────────────────
// In development, the live React UI with hot-reload runs exclusively on Vite (port 3000).
// Port 3001 is the backend API server. If accessed in a browser, redirect to port 3000.
if (process.env.SERVE_STATIC === 'true' || env.serveStatic) {
  const distPath = path.join(__dirname, '../dist')
  app.use(express.static(distPath))
  app.get('/*splat', (_req, res) => {
    res.sendFile(path.join(distPath, 'index.html'))
  })
} else {
  app.get('/', (_req, res) => {
    const accept = _req.headers.accept || ''
    if (accept.includes('text/html')) {
      return res.redirect('http://localhost:3000')
    }
    res.json({
      service: 'Inji Playground BFF Server',
      status: 'running',
      ui: 'http://localhost:3000',
    })
  })
}

// ── Global Error Handling Middleware (RFC 7807) ─────────────────────────────
app.use(errorHandlerMiddleware)

app.listen(PORT, () => {
  console.log(`[bff] Playground BFF running on http://localhost:${PORT}`)
  for (const { prefix, target } of PROXIES) console.log(`  ${prefix} → ${target}`)
  console.log(`[issuer] ${playgroundIssuer.identifier}`)
  console.log(`[issuer] signing did ${playgroundIssuer.key.did}`)
  console.log(`[wallet] holder did (issuance/P-256) ${playgroundWallet.key.did}`)
  console.log(`[wallet] holder did (presentation/Ed25519) ${playgroundWallet.presentationKey.did}`)
})
