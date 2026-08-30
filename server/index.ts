import express from 'express'
import cors from 'cors'
import * as jose from 'jose'
import { createIssuer } from './issuer'
import { createWallet } from './wallet'

const app = express()
const PORT = Number(process.env.PORT || 3001)

// Override when a tunnel is fronting the BFF, so credential offers and QR codes
// carry a URL a phone can actually reach.
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '')
const ISSUER_MOUNT = '/api/playground-issuer'
const PLAYGROUND_ISSUER_ID = `${PUBLIC_BASE_URL}${ISSUER_MOUNT}`

// ── Collab sandbox endpoints ────────────────────────────────────────────────
// Inji Verify is NOT deployed at api.collab.mosip.net. That host answers with a
// 404 page from an unrelated Express app ("Cannot POST /v1/verify/vp-request"),
// which is why every OpenID4VP call used to fall through to a mock. The real
// verify-service sits behind the verify-ui nginx, which proxies /v1/verify to
// verify-service:8080 (see inji-verify/verify-ui/nginx.conf).
const ENDPOINTS = {
  issuer: 'https://injicertify-mock.collab.mosip.net',
  esignet: 'https://esignet.collab.mosip.net',
  esignetMock: 'https://esignet-mock.collab.mosip.net',
  verifier: 'https://injiverify.collab.mosip.net',
  mimoto: 'https://api.collab.mosip.net/v1/mimoto',
}

// Inji Verify exposes a v2, DCQL-based API that the cloned repo predates.
// Discovered from the live spec at /v1/verify/v3/api-docs.
export const VERIFY = {
  vpRequest: '/v1/verify/v2/vp-request',
  vpRequestJwt: (requestId: string) => `/v1/verify/v2/vp-request/${requestId}`,
  vpRequestStatus: (requestId: string) => `/v1/verify/vp-request/${requestId}/status`,
  directPost: '/v1/verify/v2/vp-submission/direct-post',
  vpResults: (txnId: string) => `/v1/verify/v2/vp-results/${txnId}`,
  vcVerification: '/v1/verify/v2/vc-verification',
}

app.use(cors())
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true, limit: '5mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', endpoints: ENDPOINTS, playgroundIssuer: PLAYGROUND_ISSUER_ID })
})

// ── Generic proxy ───────────────────────────────────────────────────────────
// Forwards a request to a sandbox host and hands back status + parsed body.
// Never throws on a non-2xx: callers decide what an error status means.
async function proxyRequest(
  targetBase: string,
  path: string,
  method: string,
  headers: Record<string, string>,
  body?: unknown,
) {
  const url = `${targetBase}${path}`

  const fetchHeaders: Record<string, string> = {}
  for (const h of ['content-type', 'authorization', 'accept', 'accept-language']) {
    if (headers[h]) fetchHeaders[h] = headers[h]
  }

  const options: RequestInit = { method, headers: fetchHeaders }

  if (body && method !== 'GET' && method !== 'HEAD') {
    const contentType = fetchHeaders['content-type'] || ''
    if (contentType.includes('urlencoded')) {
      options.body = new URLSearchParams(body as Record<string, string>).toString()
    } else {
      options.body = JSON.stringify(body)
      if (!fetchHeaders['content-type']) fetchHeaders['content-type'] = 'application/json'
    }
  }

  const response = await fetch(url, options)
  const responseContentType = response.headers.get('content-type') || ''
  const isJson = responseContentType.includes('json')

  console.log(`[proxy] ${method} ${url} → ${response.status}`)

  return {
    status: response.status,
    contentType: responseContentType,
    body: isJson ? await response.json() : await response.text(),
  }
}

// Express 5 wildcard: /*splat captures the remainder of the path.
function splatPath(req: express.Request) {
  const splat = (req.params as Record<string, string[] | string>).splat
  return '/' + (Array.isArray(splat) ? splat.join('/') : splat || '')
}

// The three original handlers differed only in target host and error string.
const PROXIES: { prefix: string; target: string; label: string }[] = [
  { prefix: '/api/issuer', target: ENDPOINTS.issuer, label: 'issuer' },
  { prefix: '/api/esignet', target: ENDPOINTS.esignet, label: 'eSignet' },
  { prefix: '/api/esignet-mock', target: ENDPOINTS.esignetMock, label: 'eSignet (mock)' },
  { prefix: '/api/verifier', target: ENDPOINTS.verifier, label: 'verifier' },
  { prefix: '/api/mimoto', target: ENDPOINTS.mimoto, label: 'Mimoto' },
]

for (const { prefix, target, label } of PROXIES) {
  app.all(`${prefix}/*splat`, async (req, res) => {
    try {
      const result = await proxyRequest(
        target, splatPath(req), req.method,
        req.headers as Record<string, string>, req.body,
      )
      if (typeof result.body === 'string') {
        res.status(result.status).type(result.contentType || 'text/plain').send(result.body)
      } else {
        res.status(result.status).json(result.body)
      }
    } catch (err) {
      console.error(`[proxy] ${label} error:`, err)
      res.status(502).json({ error: `Failed to reach ${label}`, detail: String(err) })
    }
  })
}

// ── Live issuer registry ────────────────────────────────────────────────────
// Mimoto's /v2/issuers is the source of truth for which issuers the Collab
// sandbox actually has wired up, along with the OIDC client_id each one uses.
// Far richer than the two hardcoded entries the playground shipped with.
interface RegistryIssuer {
  issuerId: string
  clientId: string
  protocol: string
  enabled: boolean
  credentialIssuerHost: string
  tokenEndpoint: string
  qrCodeType: string
  displayName: string
}

let registryCache: { at: number; issuers: RegistryIssuer[] } | null = null
const REGISTRY_TTL_MS = 5 * 60 * 1000

async function loadRegistry(): Promise<RegistryIssuer[]> {
  if (registryCache && Date.now() - registryCache.at < REGISTRY_TTL_MS) {
    return registryCache.issuers
  }

  const res = await fetch(`${ENDPOINTS.mimoto}/v2/issuers`)
  if (!res.ok) throw new Error(`Mimoto registry returned HTTP ${res.status}`)

  const raw = await res.json() as {
    response?: { issuers?: Record<string, unknown>[] }
  }

  const issuers: RegistryIssuer[] = (raw.response?.issuers || []).map((i) => {
    const display = (i.display as { name?: string; language?: string }[]) || []
    const en = display.find(d => d.language === 'en') || display[0]
    return {
      issuerId: String(i.issuer_id ?? ''),
      clientId: String(i.client_id ?? ''),
      protocol: String(i.protocol ?? ''),
      enabled: String(i.enabled ?? 'false') === 'true',
      credentialIssuerHost: String(i.credential_issuer_host ?? ''),
      tokenEndpoint: String(i.token_endpoint ?? ''),
      qrCodeType: String(i.qr_code_type ?? ''),
      displayName: en?.name || String(i.issuer_id ?? ''),
    }
  })

  registryCache = { at: Date.now(), issuers }
  return issuers
}

app.get('/api/registry/issuers', async (_req, res) => {
  try {
    res.json({ issuers: await loadRegistry() })
  } catch (err) {
    console.error('[registry] error:', err)
    res.status(502).json({ error: 'Failed to load Mimoto issuer registry', detail: String(err) })
  }
})

// ── Issuer metadata for any registry host ───────────────────────────────────
// Only hosts that appear in Mimoto's registry (or the known mock issuer) are
// fetchable, so this cannot be turned into an open proxy.
async function assertAllowedIssuerHost(host: string) {
  if (host === ENDPOINTS.issuer) return
  if (host === PLAYGROUND_ISSUER_ID) return
  const registry = await loadRegistry()
  if (!registry.some(i => i.credentialIssuerHost === host)) {
    throw new Error(`Issuer host not in Mimoto registry: ${host}`)
  }
}

app.get('/api/wellknown', async (req, res) => {
  const host = String(req.query.host || ENDPOINTS.issuer)
  try {
    await assertAllowedIssuerHost(host)
    const result = await proxyRequest(
      host, '/.well-known/openid-credential-issuer', 'GET', {},
    )
    res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[wellknown] error:', err)
    res.status(400).json({ error: 'Failed to fetch issuer metadata', host, detail: String(err) })
  }
})

// ── OpenID4VCI issuance attempt against a real Collab issuer ────────────────
// Generates a holder key, discovers metadata, takes a fresh c_nonce, signs a
// proof-of-possession, and asks for the credential. The Collab issuers reject
// the final call without an OAuth access token (documented gap): this endpoint
// reports that verbatim rather than fabricating a credential.
app.post('/api/flow/issue', async (req, res) => {
  const {
    credentialType = 'MockVerifiableCredential',
    format = 'ldp_vc',
    issuerHost = ENDPOINTS.issuer,
    accessToken,
  } = req.body || {}
  const steps: { step: string; status: string; data: unknown }[] = []

  try {
    await assertAllowedIssuerHost(issuerHost)

    const { publicKey, privateKey } = await jose.generateKeyPair('EdDSA')
    const publicJwk = await jose.exportJWK(publicKey)
    const holderDid = `did:jwk:${Buffer.from(JSON.stringify(publicJwk)).toString('base64url')}`
    steps.push({ step: 'keypair', status: 'ok', data: { holderDid, algorithm: 'EdDSA' } })

    const metadataRes = await fetch(`${issuerHost}/.well-known/openid-credential-issuer`)
    if (!metadataRes.ok) throw new Error(`Metadata discovery returned HTTP ${metadataRes.status}`)
    const metadata = await metadataRes.json() as Record<string, unknown>
    const credEndpoint = metadata.credential_endpoint as string
    const nonceEndpoint = metadata.nonce_endpoint as string
    steps.push({
      step: 'metadata',
      status: 'ok',
      data: {
        credEndpoint,
        nonceEndpoint,
        credential_issuer: metadata.credential_issuer,
        authorization_servers: metadata.authorization_servers,
      },
    })

    let cNonce: string | undefined
    if (nonceEndpoint) {
      const nonceRes = await fetch(nonceEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const nonceData = await nonceRes.json() as Record<string, unknown>
      cNonce = nonceData.c_nonce as string
      steps.push({ step: 'nonce', status: nonceRes.ok ? 'ok' : `error_${nonceRes.status}`, data: nonceData })
    } else {
      steps.push({ step: 'nonce', status: 'skipped', data: { reason: 'no nonce_endpoint advertised' } })
    }

    const proofJwt = await new jose.SignJWT({ nonce: cNonce })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'openid4vci-proof+jwt', jwk: publicJwk })
      .setIssuer(holderDid)
      .setAudience(metadata.credential_issuer as string)
      .setIssuedAt()
      .sign(privateKey)
    steps.push({
      step: 'proof',
      status: 'ok',
      data: { jwt_length: proofJwt.length, iss: holderDid, nonce: cNonce, alg: 'EdDSA' },
    })

    const credHeaders: Record<string, string> = { 'Content-Type': 'application/json' }
    if (accessToken) credHeaders.Authorization = `Bearer ${accessToken}`

    const credRes = await fetch(credEndpoint, {
      method: 'POST',
      headers: credHeaders,
      body: JSON.stringify({
        format,
        credential_definition: { type: ['VerifiableCredential', credentialType] },
        proof: { proof_type: 'jwt', jwt: proofJwt },
      }),
    })
    const credResponseBody = await credRes.json().catch(() => ({}))
    steps.push({
      step: 'credential',
      status: credRes.ok ? 'ok' : `error_${credRes.status}`,
      data: credResponseBody,
    })

    res.json({
      success: credRes.ok,
      httpStatus: credRes.status,
      hadAccessToken: Boolean(accessToken),
      steps,
      credential: credRes.ok ? credResponseBody : null,
    })
  } catch (err) {
    console.error('[flow] issuance error:', err)
    res.status(500).json({ success: false, error: String(err), steps })
  }
})

// ── The playground's own OpenID4VCI issuer ──────────────────────────────────
const playgroundIssuer = await createIssuer({ baseUrl: PUBLIC_BASE_URL, mountPath: ISSUER_MOUNT })
app.use(ISSUER_MOUNT, playgroundIssuer.router)

// OpenID4VCI says the well-known segment is inserted between the host and the
// path of the issuer identifier, while nearly every wallet in practice appends
// it to the end. Both are served, so a wallet works either way — and the
// disagreement itself is worth recording in the interoperability report.
app.get(`/.well-known/openid-credential-issuer${ISSUER_MOUNT}`, (_req, res) => {
  res.json(playgroundIssuer.issuerMetadata())
})
app.get(`/.well-known/oauth-authorization-server${ISSUER_MOUNT}`, (_req, res) => {
  res.json(playgroundIssuer.authorizationServerMetadata())
})

// ── The playground's holder wallet ──────────────────────────────────────────
// Points at any OpenID4VCI issuer, not just ours, so the same step log can be
// compared across implementations.
const playgroundWallet = await createWallet()
app.use('/api/wallet', playgroundWallet.router)

// ── Mock v1 Verifier for the React SDK ──────────────────────────────────────
// The @mosip/react-inji-verify-sdk strictly expects the older v1 API (presentationDefinition)
// which has been removed from the Collab Sandbox. This mock satisfies its initialization
// step so the SDK successfully renders its OpenID4VP QR code in the UI for the demo video.
app.post('/api/mock-verifier/authorization-request', (_req, res) => {
  const transactionId = `mock-txn-${Date.now()}`
  res.json({
    transactionId,
    requestUri: `${PUBLIC_BASE_URL}/api/mock-verifier/request-object/${transactionId}`,
    client_id: 'did:web:mock-verifier.inji.playground',
  })
})

// Optional: Mock status polling to prevent console red ink
app.get('/api/mock-verifier/status', (_req, res) => {
  res.json({ status: 'pending' })
})

app.listen(PORT, () => {
  console.log(`[bff] Playground BFF running on http://localhost:${PORT}`)
  for (const { prefix, target } of PROXIES) console.log(`  ${prefix} → ${target}`)
  console.log(`[issuer] ${playgroundIssuer.identifier}`)
  console.log(`[issuer] signing did ${playgroundIssuer.key.did}`)
  console.log(`[wallet] holder did ${playgroundWallet.key.did}`)
})
