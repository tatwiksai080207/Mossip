import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import { createIssuer } from './issuer'
import { createWallet } from './wallet'
import { oidcRouter, discoveryHandler } from './oidc'
import { waltidVerifierRouter } from './external/waltid'
import { createWaltIdIssuer } from './external/waltid-issuer'
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
import { errorHandlerMiddleware } from './errors'
import { env } from './config/env'

export { getPublicBaseUrl, getActiveTamperMode, applyTamperingToVpToken, VERIFY }

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
app.set('etag', false)
const PORT = env.port

const PUBLIC_BASE_URL = getPublicBaseUrl()
const ISSUER_MOUNT = '/api/playground-issuer'
const WALTID_ISSUER_MOUNT = '/api/external/waltid/issuer'

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

// 6. External Reference Integrations (walt.id verifier and issuer)
app.use('/api/external/waltid/verifier', waltidVerifierRouter)
const waltIdIssuer = await createWaltIdIssuer({ baseUrl: PUBLIC_BASE_URL, mountPath: WALTID_ISSUER_MOUNT })
app.use(WALTID_ISSUER_MOUNT, waltIdIssuer.router)
app.get(`/.well-known/openid-credential-issuer${WALTID_ISSUER_MOUNT}`, (req, res) => {
  res.json(waltIdIssuer.issuerMetadata(req))
})
app.get(`/.well-known/oauth-authorization-server${WALTID_ISSUER_MOUNT}`, (req, res) => {
  res.json(waltIdIssuer.authorizationServerMetadata(req))
})

// 7. Route Modules
app.use('/api/tamper', tamperRouter)
app.use(verifierRouter)
app.use(keycloakMockRouter)
app.use(standardProxyRouter)
app.use(registryRouter)
app.use(diagnosticsRouter)

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
