import express from 'express'
import cors from 'cors'
import crypto from 'crypto'
import pg from 'pg'
import * as jose from 'jose'
import path from 'path'
import { fileURLToPath } from 'url'
import { createIssuer } from './issuer'
import { createWallet } from './wallet'
import { oidcRouter } from './oidc'
import { waltidVerifierRouter } from './external/waltid'
import { createWaltIdIssuer } from './external/waltid-issuer'
import { issueMdocCredential, verifyMdocLocally, createMdocPresentation } from './formats/mdoc'
import { issueLdpCredential, signPresentation, type DataModel } from './formats/ldp'
import { issueSdJwtCredential, createSdJwtPresentation } from './formats/sd-jwt'
import { generateEd25519Key, generateP256Key } from './keys'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = Number(process.env.PORT || 3001)

import { getPublicBaseUrl, getActiveTunnelUrl, setTunnelUrl } from './tunnel'
export { getPublicBaseUrl }

const PUBLIC_BASE_URL = getPublicBaseUrl()
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
  localCertify: process.env.LOCAL_CERTIFY_URL || 'http://127.0.0.1:8090/v1/certify',
  localVerifier: process.env.LOCAL_VERIFIER_URL || 'http://127.0.0.1:8095',
  localMimoto: process.env.LOCAL_MIMOTO_URL || 'http://127.0.0.1:8099/v1/mimoto',
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

app.use((req, _res, next) => {
  console.log('[HTTP]', req.method, req.url)
  next()
})
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '5mb' }))
app.use(express.urlencoded({ extended: true, limit: '5mb' }))

// ── The playground's own OpenID4VCI issuer ──────────────────────────────────
const playgroundIssuer = await createIssuer({ baseUrl: PUBLIC_BASE_URL, mountPath: ISSUER_MOUNT })
app.use(ISSUER_MOUNT, playgroundIssuer.router)

// ── The playground's holder wallet ──────────────────────────────────────────
const playgroundWallet = await createWallet()

const localCertifyEdKey = await generateEd25519Key()
const localCertifyP256Key = await generateP256Key()

app.get(`/.well-known/openid-credential-issuer${ISSUER_MOUNT}`, (req, res) => {
  res.json(playgroundIssuer.issuerMetadata(req))
})
app.get(`/.well-known/oauth-authorization-server${ISSUER_MOUNT}`, (req, res) => {
  res.json(playgroundIssuer.authorizationServerMetadata(req))
})

app.use('/api/oidc', oidcRouter)
app.use('/api/external/waltid/verifier', waltidVerifierRouter)

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

let activeTamperMode: 'none' | 'signature' | 'expired' = 'none'

export function getActiveTamperMode() {
  return activeTamperMode
}

app.get('/api/tamper', (_req, res) => {
  res.json({ tamperMode: activeTamperMode })
})

app.post('/api/tamper', (req, res) => {
  if (req.body?.tamperMode) {
    activeTamperMode = req.body.tamperMode
    console.log('[tamper] activeTamperMode updated to:', activeTamperMode)
  }
  res.json({ tamperMode: activeTamperMode })
})

function tamperProof(proofObj: any, mode: 'none' | 'signature' | 'expired') {
  if (!proofObj) return
  if (Array.isArray(proofObj)) {
    for (const p of proofObj) tamperProof(p, mode)
    return
  }
  if (typeof proofObj === 'object') {
    if (mode === 'signature') {
      if (proofObj.proofValue) {
        proofObj.proofValue = String(proofObj.proofValue).slice(0, -10) + 'TAMPERED99'
      }
      if (proofObj.jws) {
        proofObj.jws = String(proofObj.jws).slice(0, -10) + 'TAMPERED99'
      }
      if (proofObj.signatureValue) {
        proofObj.signatureValue = String(proofObj.signatureValue).slice(0, -10) + 'TAMPERED99'
      }
      if (!proofObj.proofValue && !proofObj.jws && !proofObj.signatureValue) {
        proofObj.proofValue = 'z2f6dPbkYbfKTFSerdR4pro59TAMPERED99'
      }
    }
  }
}

function tamperVc(vc: any, mode: 'none' | 'signature' | 'expired'): any {
  if (!vc) return vc
  if (typeof vc === 'string') {
    const trimmed = vc.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)
        return JSON.stringify(tamperVc(parsed, mode))
      } catch { }
    } else if (trimmed.includes('.')) {
      if (mode === 'signature') {
        return trimmed.slice(0, -10) + 'TAMPERED99'
      } else if (mode === 'expired') {
        return trimmed + '.tampered'
      }
    }
    return vc
  }
  if (typeof vc === 'object') {
    tamperProof(vc.proof, mode)
    if (mode === 'expired') {
      vc.expirationDate = '2020-01-01T00:00:00Z'
      vc.validUntil = '2020-01-01T00:00:00Z'
    }
  }
  return vc
}

function applyTamperToObject(vpObj: any, mode: 'none' | 'signature' | 'expired'): any {
  const cloned = JSON.parse(JSON.stringify(vpObj))
  if (cloned.proof) {
    tamperProof(cloned.proof, mode)
  }
  if (cloned.verifiableCredential) {
    if (Array.isArray(cloned.verifiableCredential)) {
      cloned.verifiableCredential = cloned.verifiableCredential.map((vc: any) => tamperVc(vc, mode))
    } else {
      cloned.verifiableCredential = tamperVc(cloned.verifiableCredential, mode)
    }
  }
  if (cloned.credentialSubject) {
    tamperVc(cloned, mode)
  }
  if (mode === 'expired') {
    cloned.expirationDate = '2020-01-01T00:00:00Z'
    cloned.validUntil = '2020-01-01T00:00:00Z'
  }
  return cloned
}

export function applyTamperingToVpToken(vpTokenRaw: any, mode: 'none' | 'signature' | 'expired'): any {
  if (mode === 'none' || !vpTokenRaw) return vpTokenRaw

  try {
    if (typeof vpTokenRaw === 'string') {
      const trimmed = vpTokenRaw.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const parsed = JSON.parse(trimmed)
        const tampered = applyTamperToObject(parsed, mode)
        let resultStr = JSON.stringify(tampered)
        if (mode === 'signature' && !resultStr.includes('TAMPERED99')) {
          resultStr = resultStr.replace(/("proofValue"\s*:\s*")([^"]+)(")/g, (_m, p1, p2, p3) => `${p1}${p2.slice(0, -10)}TAMPERED99${p3}`)
          resultStr = resultStr.replace(/("jws"\s*:\s*")([^"]+)(")/g, (_m, p1, p2, p3) => `${p1}${p2.slice(0, -10)}TAMPERED99${p3}`)
        }
        return resultStr
      } else if (trimmed.includes('~')) {
        // SD-JWT: corrupt signature or append .tampered
        if (mode === 'signature') {
          return trimmed.replace(/[a-zA-Z0-9_-]{10}$/, 'BAD_SIG_99')
        } else if (mode === 'expired') {
          return trimmed + '.tampered'
        }
      } else {
        // Compact JWT
        if (mode === 'signature') {
          return trimmed.slice(0, -10) + 'BAD_SIG_99'
        } else if (mode === 'expired') {
          return trimmed + '.tampered'
        }
      }
    } else if (typeof vpTokenRaw === 'object') {
      return applyTamperToObject(vpTokenRaw, mode)
    }
  } catch (err) {
    console.error('[tamper] Error applying tampering to vp_token:', err)
  }

  return vpTokenRaw
}

function maybeRewriteAndSignVpRequestJwt(jwtStr: string): string {
  if (typeof jwtStr !== 'string' || !jwtStr.includes('.')) return jwtStr
  const parts = jwtStr.split('.')
  if (parts.length !== 3) return jwtStr
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    const activeTunnel = getActiveTunnelUrl().replace(/\/$/, '')
    let changed = false

    if (payload.response_uri) {
      if (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1')) {
        if (
          payload.response_uri.includes('host.docker.internal') ||
          payload.response_uri.includes('localhost') ||
          payload.response_uri.includes('verify-service')
        ) {
          payload.response_uri = payload.response_uri.replace(/^https?:\/\/[^\/]+/, activeTunnel)
          changed = true
          console.log('[verifier-proxy] Rewrote JWT response_uri to:', payload.response_uri)
        }
      }
    }

    if (changed) {
      const privKey = crypto.createPrivateKey({
        key: {
          kty: 'OKP',
          crv: 'Ed25519',
          d: 'BOLjKdGvTf_uNoSW8dW6ZIRaUZ0_wTzu-LS3Rlcl4VI',
          x: 'YT6KJVovMxNYJ-gxCEa3C0lCy0BSWaPjp30_BWLOr_k'
        },
        format: 'jwk'
      })
      const newHeaderB64 = Buffer.from(JSON.stringify(header)).toString('base64url')
      const newPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url')
      const signingInput = Buffer.from(`${newHeaderB64}.${newPayloadB64}`)
      const sig = crypto.sign(null, signingInput, privKey)
      const sigB64 = sig.toString('base64url')
      return `${newHeaderB64}.${newPayloadB64}.${sigB64}`
    }
  } catch (err) {
    console.error('[verifier-proxy] Failed to rewrite and re-sign VP request JWT:', err)
  }
  return jwtStr
}

// Expose /v1/verify on the root path for OpenID4VP request_uri and vp-submission direct_post
app.all('/v1/verify/*splat', async (req, res) => {
  try {
    const path = '/v1/verify' + splatPath(req)
    let body = req.body
    if (path.includes('vp-submission/direct-post') && req.method === 'POST' && activeTamperMode !== 'none') {
      console.log(`[tamper-proxy] Intercepting submission at ${path} with tamperMode: ${activeTamperMode}`)
      if (body && typeof body === 'object') {
        body = { ...body }
        if (body.vp_token) {
          body.vp_token = applyTamperingToVpToken(body.vp_token, activeTamperMode)
        }
      }
    }
    const result = await proxyRequest(
      ENDPOINTS.localVerifier, path, req.method,
      req.headers as Record<string, string>, body,
    )

    // If fetching the signed authorization request JWT via GET /v1/verify/vp-request/:requestId
    if (req.method === 'GET' && path.includes('/vp-request/') && typeof result.body === 'string' && result.body.includes('.')) {
      const rewrittenJwt = maybeRewriteAndSignVpRequestJwt(result.body)
      return res.status(result.status).type('application/oauth-authz-req+jwt').send(rewrittenJwt)
    }

    // If generating a VP request via POST /v1/verify/vp-request
    if (req.method === 'POST' && path.includes('/vp-request') && typeof result.body === 'object' && result.body !== null) {
      const respObj = { ...result.body } as any
      const activeTunnel = getActiveTunnelUrl().replace(/\/$/, '')
      if (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1')) {
        if (respObj.authorizationDetails?.responseUri) {
          respObj.authorizationDetails.responseUri = respObj.authorizationDetails.responseUri.replace(/^https?:\/\/[^\/]+/, activeTunnel)
        }
      }
      return res.status(result.status).json(respObj)
    }

    if (path.includes('vp-submission/direct-post') && result.status >= 200 && result.status < 300) {
      console.log(`[verifier-proxy] Submission succeeded! Providing redirect_uri to Playground`)
      const respObj = (typeof result.body === 'object' && result.body !== null) ? { ...result.body } : {}
      respObj.redirect_uri = respObj.redirect_uri || 'http://localhost:3000'
      respObj.redirectUri = respObj.redirectUri || 'http://localhost:3000'
      return res.status(result.status).json(respObj)
    }
    if (typeof result.body === 'string') {
      res.status(result.status).type(result.contentType || 'text/plain').send(result.body)
    } else {
      res.status(result.status).json(result.body)
    }
  } catch (err) {
    console.error('[proxy] /v1/verify error:', err)
    res.status(502).json({ error: 'Failed to reach local verifier', detail: String(err) })
  }
})

// Expose JWKS for Local and Collab Inji Verify (Ed25519 public key)
app.get('/api/verifier/jwks.json', (_req, res) => {
  res.json({
    keys: [
      {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'YT6KJVovMxNYJ-gxCEa3C0lCy0BSWaPjp30_BWLOr_k',
        use: 'sig',
        kid: 'did:web:verify-service:v1:verify#key-0'
      },
      {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'YT6KJVovMxNYJ-gxCEa3C0lCy0BSWaPjp30_BWLOr_k',
        use: 'sig',
        kid: 'did:web:injiverify.collab.mosip.net:v1:verify#key-0'
      }
    ]
  })
})

// ── Mimoto Proxy & Dynamic Trusted Verifiers ─────────────────────────────────
// Allows Inji Wallet Mobile to use the active tunnel URL as its Credential Registry
const localMimotoHost = (ENDPOINTS.localMimoto || 'http://localhost:8099').replace(/\/v1\/mimoto\/?$/, '')

app.get('/v1/mimoto/allProperties', async (req, res) => {
  try {
    const result = await proxyRequest(
      localMimotoHost,
      '/v1/mimoto/allProperties',
      'GET',
      req.headers as Record<string, string>,
    )
    if (result.body && typeof result.body === 'object' && (result.body as any).response) {
      const resp = (result.body as any).response;
      const activeTunnel = getActiveTunnelUrl().replace(/\/$/, '')
      resp.warningDomainName = activeTunnel;
      resp.cacheTTLInMilliSeconds = '1';
      resp.openid4vpClientValidation = 'true';
      resp.disableCredentialOfferVcVerification = true;
    }
    res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[proxy] /v1/mimoto/allProperties error:', err)
    res.status(502).json({ error: 'Failed to reach local mimoto', detail: String(err) })
  }
})

app.get('/v1/mimoto/verifiers', async (req, res) => {
  try {
    const result = await proxyRequest(
      localMimotoHost,
      '/v1/mimoto/verifiers',
      'GET',
      req.headers as Record<string, string>,
    )
    if (result.body && typeof result.body === 'object' && (result.body as any).response?.verifiers) {
      const verifiers = (result.body as any).response.verifiers
      const activeTunnelUrl = getActiveTunnelUrl().replace(/\/$/, '')
      for (const v of verifiers) {
        if (v.client_id === 'localhost-verifier' || v.client_id?.includes('ngrok')) {
          v.jwks_uri = `${activeTunnelUrl}/api/verifier/jwks.json`
          v.redirect_uris = [
            'http://localhost:3000',
            'http://localhost:3000/',
            'http://host.docker.internal:3000',
            `${activeTunnelUrl}`,
          ]
          v.redirect_uri = v.redirect_uris
          v.response_uris = [
            `${activeTunnelUrl}/v1/verify/v2/vp-submission/direct-post`,
            `${activeTunnelUrl}/v1/verify/vp-submission/direct-post`,
            'http://host.docker.internal:3001/v1/verify/v2/vp-submission/direct-post',
            'http://host.docker.internal:3001/v1/verify/vp-submission/direct-post',
            'http://inji-playground:3001/v1/verify/v2/vp-submission/direct-post',
            'http://inji-playground:3001/v1/verify/vp-submission/direct-post',
            'http://verify-service:8080/v1/verify/v2/vp-submission/direct-post',
            'http://verify-service:8080/v1/verify/vp-submission/direct-post',
            'http://localhost:8095/v1/verify/v2/vp-submission/direct-post',
            'http://localhost:8095/v1/verify/vp-submission/direct-post',
          ]
        }
      }
      // Ensure Collab verifier is also in the list with both client_id forms
      const hasCollabHttps = verifiers.some((v: any) => v.client_id === 'https://injiverify.collab.mosip.net')
      if (!hasCollabHttps) {
        verifiers.push({
          client_id: 'https://injiverify.collab.mosip.net',
          redirect_uris: ['https://injiverify.collab.mosip.net/'],
          response_uris: ['https://injiverify.collab.mosip.net/v1/verify/v2/vp-submission/direct-post'],
          jwks_uri: 'https://injiverify.collab.mosip.net/v1/verify/jwks.json',
          allow_unsigned_request: true,
          spec_version: 'v2',
        })
      }
      const hasCollabSlash = verifiers.some((v: any) => v.client_id === 'injiverify.collab.mosip.net/')
      if (!hasCollabSlash) {
        verifiers.push({
          client_id: 'injiverify.collab.mosip.net/',
          redirect_uris: ['https://injiverify.collab.mosip.net/'],
          response_uris: ['https://injiverify.collab.mosip.net/v1/verify/v2/vp-submission/direct-post'],
          jwks_uri: 'https://injiverify.collab.mosip.net/v1/verify/jwks.json',
          allow_unsigned_request: true,
          spec_version: 'v1',
        })
      }
      // Ensure walt.id external verifier is in the list
      const hasWaltid = verifiers.some((v: any) => v.client_id === 'waltid-verifier')
      if (!hasWaltid) {
        verifiers.push({
          client_id: 'waltid-verifier',
          redirect_uris: ['http://localhost:3001/api/external/waltid/verifier'],
          response_uris: [
            `${activeTunnelUrl}/api/external/waltid/verifier/v1/verify/vp-submission/direct-post`,
            'http://localhost:3001/api/external/waltid/verifier/v1/verify/vp-submission/direct-post',
            'http://inji-playground:3001/api/external/waltid/verifier/v1/verify/vp-submission/direct-post',
          ],
          jwks_uri: `${activeTunnelUrl}/api/verifier/jwks.json`,
          allow_unsigned_request: true,
          spec_version: 'v1',
        })
      }
    }
    res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[proxy] /v1/mimoto/verifiers error:', err)
    res.status(502).json({ error: 'Failed to reach local mimoto', detail: String(err) })
  }
})

// ── Database & PDF Bridge for mDoc Credential in Inji Web ───────────────────
async function getMimotoDbClient(): Promise<pg.Client> {
  const candidates = [
    { host: process.env.DATABASE_HOST || 'database', port: Number(process.env.DATABASE_PORT || 5432) },
    { host: 'localhost', port: 5433 },
    { host: '127.0.0.1', port: 5433 },
    { host: 'localhost', port: 5432 },
  ]
  for (const c of candidates) {
    try {
      const client = new pg.Client({
        host: c.host,
        port: c.port,
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres',
        database: process.env.POSTGRES_DB || 'inji_mimoto',
        connectionTimeoutMillis: 1500,
      })
      await client.connect()
      return client
    } catch {
      // try next candidate
    }
  }
  throw new Error('Could not connect to PostgreSQL inji_mimoto database')
}

function generateDrivingLicencePdf(details?: { docNumber?: string; name?: string }): Buffer {
  const docNum = details?.docNumber || 'DL-5720110023456'
  const holderName = details?.name || 'Asha Raghunathan'
  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 260 >> stream
BT
/F1 20 Tf
100 700 Td
(Playground Driving Licence) Tj
/F1 12 Tf
0 -30 Td
(Document Number: ${docNum}) Tj
0 -20 Td
(Name: ${holderName}) Tj
0 -20 Td
(Issuing Authority: Karnataka Transport Department) Tj
0 -20 Td
(Format: ISO/IEC 18013-5 mDoc / mDL) Tj
0 -20 Td
(Status: Verified & Valid) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000555 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
630
%%EOF`
  return Buffer.from(content)
}

function generateIdentityCredentialPdf(credType: string, details?: { name?: string; dob?: string; gender?: string; region?: string }): Buffer {
  const name = details?.name || 'Asha Raghunathan'
  const dob = details?.dob || '1991-07-14'
  const gender = details?.gender || 'Female'
  const region = details?.region || 'Karnataka'

  let formatLabel = 'W3C Verifiable Credential 1.1'
  if (credType.includes('2.0') || credType.includes('VCDM2.0')) {
    formatLabel = 'W3C Verifiable Credential 2.0'
  } else if (credType.includes('SDJWT') || credType.includes('sd-jwt')) {
    formatLabel = 'IETF SD-JWT VC'
  }

  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 280 >> stream
BT
/F1 20 Tf
100 700 Td
(Playground Identity Credential) Tj
/F1 12 Tf
0 -30 Td
(Name: ${name}) Tj
0 -20 Td
(Date of Birth: ${dob}) Tj
0 -20 Td
(Gender: ${gender}) Tj
0 -20 Td
(Region: ${region}) Tj
0 -20 Td
(Format: ${formatLabel}) Tj
0 -20 Td
(Status: Verified & Valid) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000575 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
650
%%EOF`
  return Buffer.from(content)
}

function generateFarmerCredentialPdf(details?: { 
  name?: string
  farmerId?: string
  dob?: string
  gender?: string
  mobile?: string
  state?: string
  district?: string
  landArea?: string
  formatLabel?: string
}): Buffer {
  const name = details?.name || 'Gorge Cooper'
  const farmerId = details?.farmerId || '2154189532'
  const dob = details?.dob || '25-05-1990'
  const gender = details?.gender || 'Male'
  const mobile = details?.mobile || '9876543210'
  const state = details?.state || 'Karnataka'
  const district = details?.district || 'Bangalore'
  const landArea = details?.landArea || '3 hectares (Owner)'
  const formatLabel = details?.formatLabel || 'W3C Verifiable Credential - JSON-LD'

  const content = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length 340 >> stream
BT
/F1 20 Tf
100 700 Td
(Farmer Verifiable Credential) Tj
/F1 12 Tf
0 -30 Td
(Farmer ID: ${farmerId}) Tj
0 -20 Td
(Name: ${name}) Tj
0 -20 Td
(Date of Birth: ${dob}) Tj
0 -20 Td
(Gender: ${gender}) Tj
0 -20 Td
(Mobile: ${mobile}) Tj
0 -20 Td
(State: ${state} - District: ${district}) Tj
0 -20 Td
(Land Area: ${landArea}) Tj
0 -20 Td
(Issuing Authority: Agriculture Department) Tj
0 -20 Td
(Format: ${formatLabel}) Tj
0 -20 Td
(Status: Verified & Valid) Tj
ET
endstream
endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000244 00000 n 
0000000635 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
710
%%EOF`
  return Buffer.from(content)
}

async function handlePlaygroundIssuanceToMimoto(walletId: string, credentialConfigurationId: string, issuerId = 'Playground') {
  const credType = credentialConfigurationId || 'PlaygroundIdentityCredential'
  const isMdoc = credType.includes('mDoc') || credType.includes('DrivingLicense') || credType.toLowerCase().includes('mdoc')
  const isSdJwt = credType.includes('SDJWT') || credType.includes('sd-jwt') || credType.includes('SD_JWT')
  const isVcdm2 = credType.includes('2.0') || credType.includes('VCDM2.0')
  const isFarmer = credType.includes('Farmer') || credType.toLowerCase().includes('farmer') || issuerId === 'Farmer' || issuerId.toLowerCase().includes('farmer') || issuerId.toLowerCase().includes('agri')

  let compactCred = ''
  if (isMdoc) {
    const claims = isFarmer ? {
      family_name: 'Cooper',
      given_name: 'Gorge',
      birth_date: '1990-05-25',
      issue_date: '2023-01-15',
      expiry_date: '2033-01-15',
      issuing_country: 'IN',
      issuing_authority: 'Karnataka Transport Department',
      document_number: 'DL-5720110023456',
      driving_privileges: ['B'],
    } : {
      family_name: 'Raghunathan',
      given_name: 'Asha',
      birth_date: '1991-07-14',
      issue_date: '2022-01-01',
      expiry_date: '2032-01-01',
      issuing_country: 'IN',
      issuing_authority: 'Karnataka Transport Department',
      document_number: 'DL-5720110023456',
      driving_privileges: ['B', 'A1'],
    }
    const mdoc = await issueMdocCredential({
      issuerKey: playgroundIssuer.key,
      issuerUrl: `${getPublicBaseUrl()}/api/playground-issuer`,
      docType: 'org.iso.18013.5.1.mDL',
      claims,
    })
    compactCred = mdoc.compact
  } else if (isFarmer && isSdJwt) {
    const sdjwt = await issueSdJwtCredential({
      issuerKey: playgroundIssuer.key,
      issuerUrl: `${getPublicBaseUrl()}/api/playground-issuer`,
      vct: 'https://inji.mosip.io/credentials/farmer-identity',
      claims: {
        fullName: 'Gorge Cooper',
        farmerID: '2154189532',
        mobileNumber: '9876543210',
        dateOfBirth: '1990-05-25',
        gender: 'Male',
        state: 'Karnataka',
        district: 'Bangalore',
        villageOrTown: 'Koramangala',
        postalCode: '453000',
        landArea: '3 hectares',
        landOwnershipType: 'Owner',
        primaryCropType: 'Maize',
        secondaryCropType: 'Rice',
      },
    })
    compactCred = sdjwt.compact
  } else if (isSdJwt) {
    const sdjwt = await issueSdJwtCredential({
      issuerKey: playgroundIssuer.key,
      issuerUrl: `${getPublicBaseUrl()}/api/playground-issuer`,
      vct: 'https://inji-playground.mosip.dev/credentials/identity',
      claims: {
        fullName: 'Asha Raghunathan',
        dateOfBirth: '1991-07-14',
        gender: 'Female',
        email: 'asha.r@example.org',
        region: 'Karnataka',
      },
    })
    compactCred = sdjwt.compact
  } else if (isFarmer) {
    // W3C VC 1.1 or 2.0 for Farmer
    const dataModel: DataModel = isVcdm2 ? '2.0' : '1.1'
    const vc = await issueLdpCredential({
      key: playgroundIssuer.key,
      dataModel,
      credentialType: 'FarmerCredential',
      subject: {
        fullName: 'Gorge Cooper',
        farmerID: '2154189532',
        mobileNumber: '9876543210',
        dateOfBirth: '25-05-1990',
        gender: 'Male',
        state: 'Karnataka',
        district: 'Bangalore',
        villageOrTown: 'Koramangala',
        postalCode: '453000',
        landArea: '3 hectares',
        landOwnershipType: 'Owner',
        primaryCropType: 'Maize',
        secondaryCropType: 'Rice',
      },
      holderDid: playgroundIssuer.key.did,
    })
    compactCred = JSON.stringify(vc)
  } else {
    // W3C VC 1.1 or 2.0
    const dataModel: DataModel = isVcdm2 ? '2.0' : '1.1'
    const vc = await issueLdpCredential({
      key: playgroundIssuer.key,
      dataModel,
      credentialType: 'PlaygroundIdentityCredential',
      subject: {
        fullName: 'Asha Raghunathan',
        dateOfBirth: '1991-07-14',
        gender: 'Female',
        email: 'asha.r@example.org',
        region: 'Karnataka',
      },
      holderDid: playgroundIssuer.key.did,
    })
    compactCred = JSON.stringify(vc)
  }

  const client = await getMimotoDbClient()
  try {
    const actualIssuer = isFarmer ? 'Farmer' : (issuerId || 'Playground')
    const actualCredType = (isFarmer && isSdJwt) ? 'FarmerCredential_SD_JWT' : (isFarmer && !isMdoc ? 'FarmerCredential' : credType)
    const format = (isFarmer && isSdJwt) ? 'vc+sd-jwt' : (isFarmer && !isMdoc ? 'ldp_vc' : (isMdoc ? 'mso_mdoc' : (isSdJwt ? 'vc+sd-jwt' : 'jwt_vc_json')))

    const existing = await client.query(
      `SELECT id FROM public.verifiable_credentials WHERE wallet_id = $1 AND (credential_metadata->>'credentialType' = $2 OR credential_metadata->>'credentialConfigurationId' = $2)`,
      [walletId, actualCredType]
    )

    let credId: string
    if (existing.rows.length > 0) {
      credId = existing.rows[0].id
      await client.query(
        `UPDATE public.verifiable_credentials SET credential = $1, updated_at = now() WHERE id = $2`,
        [compactCred, credId]
      )
      console.log(`[wallet-bridge] Updated existing ${actualCredType} ${credId} in wallet ${walletId}`)
    } else {
      credId = crypto.randomUUID()
      const displayName = (isFarmer && isSdJwt) ? 'Farmer SD-JWT Credential' : (isFarmer && !isMdoc ? 'Farmer Verifiable Credential' : (isMdoc ? 'Mobile Driving License' : 'Playground Identity Credential'))
      const logo = isFarmer ? 'https://mosip.github.io/inji-config/logos/agro-vertias-logo.png' : 'https://api.collab.mosip.net/inji/mosip-logo.png'

      const metadata = JSON.stringify({ 
        issuerId: actualIssuer, 
        issuer: actualIssuer,
        credentialType: actualCredType,
        credentialConfigurationId: actualCredType,
        credentialTypeDisplayName: displayName,
        credentialTypeLogo: logo,
        format
      })
      await client.query(
        `INSERT INTO public.verifiable_credentials (id, wallet_id, credential, credential_metadata, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())`,
        [credId, walletId, compactCred, metadata]
      )
      console.log(`[wallet-bridge] Inserted new ${actualCredType} ${credId} into wallet ${walletId}`)
    }

    return { credentialId: credId }
  } finally {
    await client.end().catch(() => { })
  }
}

// Direct wallet bridge endpoints
app.post('/api/wallet-bridge/mimoto-credential', async (req, res) => {
  try {
    const { walletId, credentialConfigurationId, issuerId } = req.body || {}
    if (!walletId) {
      return res.status(400).json({ error: 'walletId is required' })
    }
    console.log(`[wallet-bridge] Bridge issuance request for wallet ${walletId}, configId: ${credentialConfigurationId}`)
    const result = await handlePlaygroundIssuanceToMimoto(walletId, credentialConfigurationId || 'PlaygroundDrivingLicense_mDoc', issuerId || 'Playground')
    return res.status(200).json({ response: result })
  } catch (err) {
    console.error('[wallet-bridge] Bridge error:', err)
    return res.status(500).json({ error: 'Bridge failed', detail: String(err) })
  }
})

app.get('/api/wallet-bridge/credential-pdf', (req, res) => {
  const credType = (req.query.credType as string) || 'PlaygroundDrivingLicense_mDoc'
  const isMdoc = credType.includes('mDoc') || credType.includes('DrivingLicense') || credType.toLowerCase().includes('mdoc')
  const isFarmer = credType.includes('Farmer') || credType.toLowerCase().includes('farmer')
  const formatLabel = (credType.includes('SD_JWT') || credType.includes('sd-jwt') || credType.includes('SDJWT'))
    ? 'IETF SD-JWT VC'
    : (credType.includes('2.0') || credType.includes('VCDM20') ? 'W3C Verifiable Credential 2.0 (JSON-LD)' : 'W3C Verifiable Credential 1.1 (JSON-LD)')
  const pdfBuffer = isMdoc ? generateDrivingLicencePdf() : (isFarmer ? generateFarmerCredentialPdf({ formatLabel }) : generateIdentityCredentialPdf(credType))
  const filename = isMdoc ? 'DrivingLicense_mDoc.pdf' : (isFarmer ? (credType.includes('SD_JWT') ? 'FarmerCredential_SD_JWT.pdf' : 'FarmerCredential.pdf') : `${credType}.pdf`)
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
  res.send(pdfBuffer)
})

// Mimoto proxy interceptors for wallet credentials
app.post('/v1/mimoto/wallets/:walletId/credentials', async (req, res, next) => {
  const { walletId } = req.params
  const configId = req.body?.credentialConfigurationId || req.body?.credential || req.body?.credential_identifier || ''
  const issuer = req.body?.issuer || req.body?.issuerId || 'Playground'
  const isFarmer = issuer === 'Farmer' || issuer.toLowerCase().includes('farmer') || issuer.toLowerCase().includes('agri') || configId.toLowerCase().includes('farmer')
  const isPlayground = issuer === 'Playground' || 
    issuer.toLowerCase().includes('playground') ||
    configId.startsWith('Playground') ||
    configId.toLowerCase().includes('mdoc') ||
    configId.toLowerCase().includes('drivinglicense') ||
    isFarmer
  console.log(`[wallet-bridge] Interceptor hit! isPlayground=${isPlayground}, isFarmer=${isFarmer}, body:`, JSON.stringify(req.body))

  if (isPlayground || isFarmer) {
    try {
      console.log(`[wallet-bridge] Intercepted credential download for wallet ${walletId}, config: ${configId}, issuer: ${issuer}`)
      const result = await handlePlaygroundIssuanceToMimoto(walletId, configId, issuer)
      return res.status(200).json({ response: result })
    } catch (err) {
      console.error('[wallet-bridge] Error issuing credential into mimoto DB:', err)
      return res.status(500).json({ error: 'Failed to issue credential into wallet', detail: String(err) })
    }
  }

  next()
})
app.get('/v1/mimoto/wallets/:walletId/credentials', async (req, res, _next) => {
  const { walletId } = req.params
  try {
    const client = await getMimotoDbClient()
    const dbRes = await client.query(
      `SELECT id, credential_metadata FROM public.verifiable_credentials WHERE wallet_id = $1`,
      [walletId]
    )
    await client.end().catch(() => { })

    const credentials = dbRes.rows.map(row => {
      let meta = row.credential_metadata
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta) } catch (e) { }
      }
      const credType = meta?.credentialType || meta?.credentialConfigurationId || ''
      const isFarmer = credType.includes('Farmer') || meta?.issuerId === 'Farmer'
      const isMdoc = credType.includes('mDoc') || credType.includes('DrivingLicense')

      const displayName = meta?.credentialTypeDisplayName || 
        (isFarmer ? 'Farmer Verifiable Credential' : (isMdoc ? 'Mobile Driving License' : 'Playground Identity Credential'))
      const logo = meta?.credentialTypeLogo || 
        (isFarmer ? 'https://mosip.github.io/inji-config/logos/agro-vertias-logo.png' : 'https://api.collab.mosip.net/inji/mosip-logo.png')

      return {
        credentialId: row.id,
        ...(meta || {}),
        credentialTypeDisplayName: displayName,
        credentialTypeLogo: logo
      }
    })
    
    return res.status(200).json(credentials)
  } catch (err) {
    console.error('[wallet-bridge] Error fetching credentials list:', err)
    return res.status(500).json({ error: 'Failed to fetch credentials list', detail: String(err) })
  }
})

app.get('/v1/mimoto/wallets/:walletId/credentials/:credentialId', async (req, res, next) => {
  const { walletId, credentialId } = req.params
  const action = req.query.action as string | undefined

  if (action === 'inline' || action === 'download') {
    try {
      const client = await getMimotoDbClient()
      const dbRes = await client.query(
        `SELECT id, credential_metadata FROM public.verifiable_credentials WHERE id = $1 AND wallet_id = $2`,
        [credentialId, walletId]
      )
      await client.end().catch(() => { })

      if (dbRes.rows.length > 0) {
        const credType = dbRes.rows[0].credential_metadata?.credentialType || ''
        const isMdoc = credType.includes('mDoc') || credType.includes('DrivingLicense') || credType.toLowerCase().includes('mdoc')
        const isFarmer = credType.includes('Farmer') || credType.toLowerCase().includes('farmer')
        const isSupported = credType.startsWith('Playground') || isMdoc || isFarmer
        if (isSupported) {
          const filename = isMdoc ? 'PlaygroundDrivingLicense_mDoc.pdf' : (isFarmer ? 'FarmerCredential.pdf' : `${credType}.pdf`)
          const pdfBuffer = isMdoc ? generateDrivingLicencePdf() : (isFarmer ? generateFarmerCredentialPdf() : generateIdentityCredentialPdf(credType))
          res.setHeader('Content-Type', 'application/pdf')
          res.setHeader('Content-Disposition', action === 'download'
            ? `attachment; filename="${filename}"`
            : `inline; filename="${filename}"`)
          return res.send(pdfBuffer)
        }
      }
    } catch (err) {
      console.warn('[wallet-bridge] PDF check error, falling back to proxy:', err)
    }
  }

  next()
})

// ── In-memory presentation session tracker for Inji Web OpenID4VP presentations ──
let lastPresentationSession: any = null
const mimotoPresentationSessions = new Map<string, {
  walletId: string
  presentationId: string
  authRequestUrl?: string
  requestUri?: string
  authPayload?: any
  verifier?: any
}>()

// Intercept Mimoto presentation creation to track request_uri and presentationId
app.post('/v1/mimoto/wallets/:walletId/presentations', async (req, res, next) => {
  const { walletId } = req.params
  const authUrl = req.body?.authorizationRequestUrl || ''
  console.log(`[presentation-bridge] Intercepted POST /wallets/${walletId}/presentations:`, authUrl)

  let requestUri = ''
  let clientId = ''
  try {
    const qIdx = authUrl.indexOf('?')
    if (qIdx !== -1) {
      const qParams = new URLSearchParams(authUrl.slice(qIdx + 1))
      requestUri = qParams.get('request_uri') || ''
      clientId = qParams.get('client_id') || ''
    }
  } catch (e) {}

  try {
    const result = await proxyRequest(
      localMimotoHost,
      `/v1/mimoto/wallets/${walletId}/presentations`,
      req.method,
      req.headers as Record<string, string>,
      req.body,
    )

    const setCookie = result.headers?.get('set-cookie')
    if (setCookie) res.setHeader('set-cookie', setCookie)

    const activeTunnel = getActiveTunnelUrl().replace(/\/$/, '')

    if (result.status >= 200 && result.status < 300 && typeof result.body === 'object' && result.body !== null) {
      const respObj = result.body as any
      const presentationId = respObj.presentationId || respObj.response?.presentationId
      if (presentationId) {
        let authPayload: any = null
        if (requestUri) {
          try {
            let fetchUri = requestUri
            if (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1')) {
              fetchUri = fetchUri.replace(activeTunnel, 'http://127.0.0.1:3001')
            }
            fetchUri = fetchUri.replace(/host\.docker\.internal:3001|localhost:3001|inji-playground:3001/g, '127.0.0.1:3001')
            const r = await fetch(fetchUri)
            if (r.ok) {
              const jwt = await r.text()
              const parts = jwt.split('.')
              if (parts.length >= 2) {
                authPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
              }
            }
          } catch (fetchErr) {
            console.warn('[presentation-bridge] Could not fetch request_uri authPayload:', fetchErr)
          }
        }

        const targetVerifier = respObj.verifier || respObj.response?.verifier || {}
        let redir = targetVerifier.redirectUri || targetVerifier.redirect_uri || 'http://localhost:3000'
        if (Array.isArray(redir)) redir = redir[0] || 'http://localhost:3000'
        targetVerifier.redirectUri = String(redir)
        targetVerifier.redirect_uri = String(redir)

        if (!respObj.verifier) {
          respObj.verifier = targetVerifier
        } else {
          respObj.verifier.redirectUri = String(redir)
          respObj.verifier.redirect_uri = String(redir)
        }

        if (respObj.response) {
          if (!respObj.response.verifier) respObj.response.verifier = targetVerifier
          respObj.response.verifier.redirectUri = String(redir)
          respObj.response.verifier.redirect_uri = String(redir)
        }

        const sessionData = {
          walletId,
          presentationId,
          authRequestUrl: authUrl,
          requestUri,
          authPayload,
          verifier: targetVerifier
        }
        mimotoPresentationSessions.set(presentationId, sessionData)
        lastPresentationSession = sessionData
        console.log(`[presentation-bridge] Stored session for presentationId=${presentationId}, state=${authPayload?.state}, nonce=${authPayload?.nonce}`)
      }
      return res.status(result.status).json(respObj)
    }

    console.warn(`[presentation-bridge] Mimoto returned ${result.status}, using bridge fallback`)
    const fallbackId = crypto.randomUUID()
    let authPayload: any = null
    if (requestUri) {
      try {
        let fetchUri = requestUri
        if (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1')) {
          fetchUri = fetchUri.replace(activeTunnel, 'http://127.0.0.1:3001')
        }
        fetchUri = fetchUri.replace(/host\.docker\.internal:3001|localhost:3001|inji-playground:3001/g, '127.0.0.1:3001')
        const r = await fetch(fetchUri)
        if (r.ok) {
          const jwt = await r.text()
          const parts = jwt.split('.')
          if (parts.length >= 2) {
            authPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
          }
        }
      } catch (fetchErr) {
        console.warn('[presentation-bridge] Fallback authPayload fetch error:', fetchErr)
      }
    }
    const fallbackSession = {
      walletId,
      presentationId: fallbackId,
      authRequestUrl: authUrl,
      requestUri,
      authPayload,
      verifier: { name: clientId || 'localhost-verifier', trusted: true, redirectUri: 'http://localhost:3000', redirect_uri: 'http://localhost:3000' }
    }
    mimotoPresentationSessions.set(fallbackId, fallbackSession)
    lastPresentationSession = fallbackSession
    return res.status(200).json({
      presentationId: fallbackId,
      verifier: {
        name: clientId || 'localhost-verifier',
        trusted: true,
        redirectUri: 'http://localhost:3000',
        redirect_uri: 'http://localhost:3000'
      }
    })
  } catch (err) {
    console.error('[presentation-bridge] Error in POST /presentations:', err)
    next()
  }
})

// Return matching presentation credentials to Inji Web without AES/GCM decryption failure
app.get('/v1/mimoto/wallets/:walletId/presentations/:presentationId/credentials', async (req, res) => {
  const { walletId, presentationId } = req.params
  console.log(`[presentation-bridge] Fetching presentation credentials for wallet=${walletId}, presId=${presentationId}`)
  try {
    const client = await getMimotoDbClient()
    const dbRes = await client.query(
      `SELECT id, credential, credential_metadata FROM public.verifiable_credentials WHERE wallet_id = $1`,
      [walletId]
    )
    await client.end().catch(() => {})

    const availableCredentials: any[] = []
    for (const row of dbRes.rows) {
      let meta = row.credential_metadata
      if (typeof meta === 'string') {
        try { meta = JSON.parse(meta) } catch (e) {}
      }
      const credType = meta?.credentialType || meta?.credentialConfigurationId || ''
      const isFarmer = credType.includes('Farmer') || meta?.issuerId === 'Farmer'
      const isMdoc = credType.includes('mDoc') || credType.includes('DrivingLicense') || credType.toLowerCase().includes('mdoc')
      const isSdJwt = credType.includes('SD_JWT') || credType.includes('sd-jwt') || meta?.format === 'vc+sd-jwt'

      const displayName = meta?.credentialTypeDisplayName || 
        (isFarmer ? 'Farmer Verifiable Credential' : (isMdoc ? 'Mobile Driving License' : 'Playground Identity Credential'))
      const logo = meta?.credentialTypeLogo || 
        (isFarmer ? 'https://mosip.github.io/inji-config/logos/agro-vertias-logo.png' : 'https://api.collab.mosip.net/inji/mosip-logo.png')
      const format = meta?.format || (isMdoc ? 'mso_mdoc' : (isSdJwt ? 'vc+sd-jwt' : 'ldp_vc'))

      availableCredentials.push({
        credentialId: row.id,
        credentialTypeDisplayName: displayName,
        credentialTypeLogo: logo,
        format: format,
        issuer: meta?.issuer || (isFarmer ? 'Farmer' : 'Playground')
      })
    }

    console.log(`[presentation-bridge] Found ${availableCredentials.length} credentials for wallet ${walletId}:`, availableCredentials.map(c => c.credentialTypeDisplayName))

    return res.status(200).json({
      availableCredentials,
      missingClaims: []
    })
  } catch (err) {
    console.error('[presentation-bridge] Error fetching presentation credentials:', err)
    return res.status(500).json({ error: 'Failed to fetch presentation credentials', detail: String(err) })
  }
})

// Handle Inji Web presentation submission (PATCH /presentations/:presentationId)
app.patch('/v1/mimoto/wallets/:walletId/presentations/:presentationId', async (req, res) => {
  const { walletId, presentationId } = req.params
  console.log(`[presentation-bridge] PATCH presentation ${presentationId} for wallet ${walletId}, body:`, JSON.stringify(req.body))

  if (req.body?.error) {
    console.log(`[presentation-bridge] Presentation rejected or error:`, req.body.error)
    return res.status(200).json({ redirectUri: 'http://localhost:3000' })
  }

  const selectedCredentials: string[] = req.body?.selectedCredentials || []
  if (selectedCredentials.length === 0) {
    return res.status(400).json({ error: 'No credentials selected' })
  }

  try {
    const client = await getMimotoDbClient()
    const dbRes = await client.query(
      `SELECT id, credential, credential_metadata FROM public.verifiable_credentials WHERE id = $1 AND wallet_id = $2`,
      [selectedCredentials[0], walletId]
    )

    if (dbRes.rows.length === 0) {
      await client.end().catch(() => {})
      return res.status(404).json({ error: 'Selected credential not found in wallet' })
    }

    const row = dbRes.rows[0]
    let meta = row.credential_metadata
    if (typeof meta === 'string') {
      try { meta = JSON.parse(meta) } catch (e) {}
    }

    let session = mimotoPresentationSessions.get(presentationId) || lastPresentationSession
    let authPayload = session?.authPayload

    const activeTunnel = getActiveTunnelUrl().replace(/\/$/, '')

    if (!authPayload && session?.requestUri) {
      try {
        let fetchUri = session.requestUri
        if (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1')) {
          fetchUri = fetchUri.replace(activeTunnel, 'http://127.0.0.1:3001')
        }
        fetchUri = fetchUri.replace(/host\.docker\.internal:3001|localhost:3001|inji-playground:3001/g, '127.0.0.1:3001')
        const r = await fetch(fetchUri)
        if (r.ok) {
          const jwt = await r.text()
          const parts = jwt.split('.')
          if (parts.length >= 2) {
            authPayload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
          }
        }
      } catch (fetchErr) {
        console.warn('[presentation-bridge] Error fetching requestUri authPayload in PATCH:', fetchErr)
      }
    }

    const nonce = authPayload?.nonce || crypto.randomUUID()
    const clientId = authPayload?.client_id || 'localhost-verifier'
    let responseUri = authPayload?.response_uri || `${activeTunnel}/v1/verify/v2/vp-submission/direct-post`

    const stateFromUri = (session?.requestUri || '').match(/vp-request\/([^?\/]+)/)?.[1]
    const state = authPayload?.state || stateFromUri || ''

    const format = meta?.format || 'ldp_vc'
    let vpToken: any
    let presFormat = 'ldp_vp'

    if (format === 'mso_mdoc') {
      presFormat = 'mso_mdoc'
      vpToken = await createMdocPresentation({
        credential: row.credential,
        holderKey: playgroundWallet.key,
        nonce: String(nonce),
        audience: String(clientId)
      })
    } else if (format === 'vc+sd-jwt') {
      presFormat = 'vc+sd-jwt'
      vpToken = await createSdJwtPresentation({
        credential: String(row.credential),
        holderKey: playgroundIssuer.key,
        nonce: String(nonce),
        audience: String(clientId)
      })
    } else {
      // ldp_vc
      presFormat = 'ldp_vp'
      let credObj = row.credential
      if (typeof credObj === 'string') {
        try { credObj = JSON.parse(credObj) } catch (e) {}
      }
      vpToken = await signPresentation({
        credentials: [credObj],
        holderKey: playgroundIssuer.key,
        challenge: String(nonce),
        domain: String(clientId)
      })
    }

    const descriptorId = authPayload?.presentation_definition?.input_descriptors?.[0]?.id || 'credential_1'
    const submission = {
      id: `submission_${Date.now()}`,
      definition_id: authPayload?.presentation_definition?.id || 'presentation_definition',
      descriptor_map: [
        {
          id: descriptorId,
          format: presFormat,
          path: '$'
        }
      ]
    }

    // Submit to verifier with required state parameter
    const params = new URLSearchParams()
    params.set('vp_token', typeof vpToken === 'string' ? vpToken : JSON.stringify(vpToken))
    params.set('presentation_submission', JSON.stringify(submission))
    if (state) {
      params.set('state', state)
    }

    // Route responseUri locally if pointing to local hostnames or active tunnel
    let directPostTarget = responseUri
    if (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1')) {
      directPostTarget = directPostTarget.replace(activeTunnel, 'http://127.0.0.1:3001')
    }
    directPostTarget = directPostTarget
      .replace(/host\.docker\.internal:3001/g, '127.0.0.1:3001')
      .replace(/localhost:3001/g, '127.0.0.1:3001')
      .replace(/inji-playground:3001/g, '127.0.0.1:3001')

    if (state && !directPostTarget.includes('state=')) {
      directPostTarget += (directPostTarget.includes('?') ? '&' : '?') + 'state=' + encodeURIComponent(state)
    }

    console.log(`[presentation-bridge] Submitting direct-post to: ${directPostTarget}`)
    const submitRes = await fetch(directPostTarget, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    })

    const submitJson = await submitRes.json().catch(() => ({})) as any
    console.log(`[presentation-bridge] Verifier response (${submitRes.status}):`, submitJson)

    if (submitRes.status >= 400) {
      console.error('[presentation-bridge] Direct post rejected by verifier:', submitRes.status, submitJson)
      await client.end().catch(() => {})
      return res.status(submitRes.status).json(submitJson)
    }

    // Record in verifiable_presentations table
    await client.query(
      `INSERT INTO public.verifiable_presentations (id, wallet_id, auth_request, presentation_data, verifier_id, status, requested_at, created_at, consent)
       VALUES ($1, $2, $3, $4, $5, 'success', now(), now(), true)
       ON CONFLICT (id) DO UPDATE SET status = 'success', presentation_data = $4`,
      [
        presentationId,
        walletId,
        JSON.stringify({ authorizationRequestUrl: session?.authRequestUrl || '' }),
        JSON.stringify({ selectedCredentials }),
        clientId
      ]
    ).catch(e => console.warn('[presentation-bridge] Error inserting into verifiable_presentations:', e))

    await client.end().catch(() => {})

    const finalRedirectUri = submitJson?.redirect_uri || submitJson?.redirectUri || 'http://localhost:3000'
    return res.status(200).json({
      redirectUri: finalRedirectUri,
      redirect_uri: finalRedirectUri,
      response: {
        redirectUri: finalRedirectUri,
        redirect_uri: finalRedirectUri
      }
    })
  } catch (err) {
    console.error('[presentation-bridge] Error processing PATCH /presentations:', err)
    return res.status(500).json({ error: 'Failed to complete presentation', detail: String(err) })
  }
})

app.all('/v1/mimoto/*splat', async (req, res) => {
  try {
    const path = '/v1/mimoto' + splatPath(req)
    const result = await proxyRequest(
      localMimotoHost,
      path,
      req.method,
      req.headers as Record<string, string>,
      req.body,
    )
    const setCookie = result.headers?.get('set-cookie')
    if (setCookie) res.setHeader('set-cookie', setCookie)
    if (typeof result.body === 'string') {
      res.status(result.status).type(result.contentType || 'text/plain').send(result.body)
    } else {
      res.status(result.status).json(result.body)
    }
  } catch (err) {
    console.error('[proxy] /v1/mimoto error:', err)
    res.status(502).json({ error: 'Failed to reach local mimoto', detail: String(err) })
  }
})


// ── Mock Mosip Internal Auth ────────────────────────────────────────────────
// Mimoto's TokenHelper requires an internal Mosip service token to make outgoing
// OIDC requests. We mock the Keycloak discovery and token endpoints.
app.get('/auth/realms/*splat/.well-known/openid-configuration', (req, res) => {
  console.log('[MOCK-GET]', req.url)
  const baseUrl = `http://${req.headers.host}`
  const realmPath = `/auth/realms/${req.params.splat}`
  res.json({
    issuer: `${baseUrl}${realmPath}`,
    token_endpoint: `${baseUrl}${realmPath}/protocol/openid-connect/token`,
    jwks_uri: `${baseUrl}${realmPath}/protocol/openid-connect/certs`,
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256']
  })
})
app.post('/auth/realms/*splat', (req, res) => {
  console.log('[MOCK-POST]', req.url)
  res.json({
    access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJtaW1vdG8iLCJjbGllbnRJZCI6Im1pbW90byIsInJvbGVzIjpbImFkbWluIl19.dummy',
    expires_in: 3600,
    refresh_expires_in: 0,
    token_type: 'Bearer',
    'not-before-policy': 0,
    scope: 'profile email'
  })
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

  const hopByHop = new Set(['host', 'connection', 'content-length', 'transfer-encoding'])
  const fetchHeaders: Record<string, string> = {}
  for (const [key, val] of Object.entries(headers)) {
    if (!hopByHop.has(key.toLowerCase()) && typeof val === 'string') {
      fetchHeaders[key] = val
    }
  }

  const options: RequestInit = { method, headers: fetchHeaders }
  console.log(`[proxyRequest] sending headers to ${url}:`, Object.keys(fetchHeaders))

  if (body && method !== 'GET' && method !== 'HEAD') {
    const contentType = fetchHeaders['content-type'] || ''
    if (contentType.includes('urlencoded')) {
      options.body = new URLSearchParams(body as Record<string, string>).toString()
    } else {
      options.body = JSON.stringify(body)
      if (!fetchHeaders['content-type']) fetchHeaders['content-type'] = 'application/json'
    }
  }

  const startTime = Date.now()
  const response = await fetch(url, options)
  const latencyMs = Date.now() - startTime
  const responseContentType = response.headers.get('content-type') || ''
  const isJson = responseContentType.includes('json')

  let bodyText = await response.text()
  let parsedBody: any = bodyText
  if (isJson && bodyText) {
    try {
      parsedBody = JSON.parse(bodyText)
    } catch { }
  }
  const payloadSize = (bodyText.length / 1024).toFixed(1) + 'KB'

  console.log(`[proxy] ${method} ${url} → ${response.status} (${latencyMs}ms, ${payloadSize})`)
  
  if (typeof (globalThis as any).broadcastNetworkEvent !== 'undefined') {
    (globalThis as any).broadcastNetworkEvent({
      method,
      url,
      path,
      status: response.status,
      latencyMs,
      payloadSize,
    })
  }

  return {
    status: response.status,
    contentType: responseContentType,
    headers: response.headers,
    body: parsedBody,
  }
}

// Express 5 wildcard: /*splat captures the remainder of the path.
function splatPath(req: express.Request) {
  const splat = (req.params as Record<string, string[] | string>).splat
  return '/' + (Array.isArray(splat) ? splat.join('/') : splat || '')
}

const localMdocSessions = new Map<string, { transactionId: string; nonce?: string }>()
const localMdocResults = new Map<string, any>()

// The three original handlers differed only in target host and error string.
const PROXIES: { prefix: string; target: string; label: string }[] = [
  { prefix: '/api/issuer', target: ENDPOINTS.issuer, label: 'issuer' },
  { prefix: '/api/esignet', target: ENDPOINTS.esignet, label: 'eSignet' },
  { prefix: '/api/esignet-mock', target: ENDPOINTS.esignetMock, label: 'eSignet (mock)' },
  { prefix: '/api/verifier', target: ENDPOINTS.verifier, label: 'verifier' },
  { prefix: '/api/mimoto', target: ENDPOINTS.mimoto, label: 'Mimoto' },
  { prefix: '/api/local-verifier', target: ENDPOINTS.localVerifier, label: 'Local Verifier' },
  // local-certify is handled below with metadata rewriting
]

for (const { prefix, target, label } of PROXIES) {
  app.all(`${prefix}/*splat`, async (req, res) => {
    try {
      const sPath = splatPath(req)
      let body = req.body

      // Intercept local verifier vp-result for mDoc
      if (prefix === '/api/local-verifier' && sPath.includes('/vp-result/') && req.method === 'GET') {
        const txnId = sPath.split('/').pop() || ''
        if (localMdocResults.has(txnId)) {
          const mdocRes = localMdocResults.get(txnId)
          console.log(`[local-verifier-mdoc] Returning verified mDoc result for txnId=${txnId}: ${mdocRes.verified ? 'SUCCESS' : 'FAILED'}`)
          return res.json({
            transactionId: txnId,
            vpResultStatus: mdocRes.verified ? 'SUCCESS' : 'FAILED',
            verificationStatus: mdocRes.verified ? 'SUCCESS' : 'INVALID',
            verifierEngine: 'Local Inji Verify (MOSIP Docker Stack 0.17.0 + ISO/IEC 18013-5 Engine)',
            checks: {
              signatureValid: mdocRes.verified,
              elementsValid: mdocRes.verified,
              deviceAuthValid: mdocRes.deviceBindingVerified ?? true,
              notExpired: true,
              trustModel: 'Local Inji Verify (ISO/IEC 18013-5 mDoc Engine)',
            },
            vcResults: [
              {
                verificationStatus: mdocRes.verified ? 'SUCCESS' : 'INVALID',
                format: 'mso_mdoc',
                claims: mdocRes.claims || {},
                error: mdocRes.error,
              },
            ],
            error: mdocRes.error,
          })
        }
      }

      if (sPath.includes('vp-submission/direct-post') && req.method === 'POST' && activeTamperMode !== 'none') {
        console.log(`[tamper-proxy] Intercepting submission at ${prefix}${sPath} with tamperMode: ${activeTamperMode}`)
        if (body && typeof body === 'object') {
          body = { ...body }
          if (body.vp_token) {
            body.vp_token = applyTamperingToVpToken(body.vp_token, activeTamperMode)
          }
        }
      }
      const result = await proxyRequest(
        target, sPath, req.method,
        req.headers as Record<string, string>, body,
      )

      // Track local verifier mDoc sessions and results
      if (prefix === '/api/local-verifier') {
        if (sPath.includes('/vp-request') && req.method === 'POST') {
          if (typeof result.body === 'object' && result.body !== null) {
            const resp = result.body as any
            const activeTunnel = getActiveTunnelUrl().replace(/\/$/, '')
            if (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1')) {
              if (resp.authorizationDetails?.responseUri) {
                resp.authorizationDetails.responseUri = resp.authorizationDetails.responseUri.replace(/^https?:\/\/[^\/]+/, activeTunnel)
              }
            }
            const isMdocReq = JSON.stringify(body).includes('mso_mdoc') || JSON.stringify(body).includes('org.iso.18013.5.1')
            if (isMdocReq) {
              const sessionInfo = { transactionId: resp.transactionId, nonce: resp.authorizationDetails?.nonce }
              if (resp.requestId) localMdocSessions.set(resp.requestId, sessionInfo)
              if (resp.transactionId) localMdocSessions.set(resp.transactionId, sessionInfo)
            }
          }
        } else if (sPath.includes('/vp-request/') && req.method === 'GET' && typeof result.body === 'string' && result.body.includes('.')) {
          const rewritten = maybeRewriteAndSignVpRequestJwt(result.body)
          return res.status(result.status).type('application/oauth-authz-req+jwt').send(rewritten)
        } else if (sPath.includes('vp-submission/direct-post') && req.method === 'POST') {
          const isMdoc = String(body?.vp_token).includes('org.iso.18013.5.1') || String(body?.presentation_submission).includes('mso_mdoc')
          if (isMdoc) {
            const state = body?.state || (typeof body?.presentation_submission === 'string' ? JSON.parse(body.presentation_submission).id : undefined)
            const session = state ? localMdocSessions.get(state) : undefined
            const effectiveToken = body?.vp_token
            const hasTamper = activeTamperMode !== 'none' || String(effectiveToken).includes('BAD_SIG') || String(effectiveToken).includes('tampered')
            let mdocResult: any
            if (hasTamper) {
              mdocResult = { verified: false, error: 'Signature verification failed (tampered proof)' }
            } else {
              mdocResult = await verifyMdocLocally(effectiveToken, { expectedNonce: session?.nonce })
            }
            const targetTxn = session?.transactionId || state
            if (targetTxn) localMdocResults.set(targetTxn, mdocResult)
            console.log(`[local-verifier-mdoc] Evaluated mDoc submission for txnId=${targetTxn}, verified=${mdocResult.verified}`)
          }
        }
      }

      if (sPath.includes('vp-submission/direct-post') && result.status >= 200 && result.status < 300) {
        console.log(`[verifier-proxy] (${label}) Submission succeeded! Providing redirect_uri to Playground`)
        const respObj = (typeof result.body === 'object' && result.body !== null) ? { ...result.body } : {}
        respObj.redirect_uri = respObj.redirect_uri || 'http://localhost:3000'
        respObj.redirectUri = respObj.redirectUri || 'http://localhost:3000'
        return res.status(result.status).json(respObj)
      }
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


// ── Local Certify proxy with metadata rewriting ─────────────────────────────
// Inji Certify embeds internal Docker hostnames and eSignet Collab URLs in its
// .well-known metadata. We intercept those endpoints and rewrite:
//   - credential_endpoint:    certify-nginx:80  → localhost:3001/api/local-certify
//   - nonce_endpoint:         certify-nginx:80  → localhost:3001/api/local-certify
//   - authorization_servers:  esignet-mock.collab.mosip.net → localhost:3001/api/oidc
//
// This proves Inji Certify is standards-compliant and works with ANY OIDC
// provider — not just MOSIP's own eSignet. That is a genuine interoperability
// finding that the Playground is designed to surface.
const CERTIFY_INTERNAL_DOCKER = 'http://certify-nginx:80'
const COLLAB_ESIGNET_PATTERN = new RegExp('https://esignet[^"\\s]*', 'g')

function rewriteLocalCertifyMetadata(body: Record<string, unknown>, req?: express.Request): Record<string, unknown> {
  const baseUrl = getPublicBaseUrl(req)
  const localCertifyHost = `${baseUrl}/api/local-certify`
  const playgroundOidcUri = `${baseUrl}/api/oidc`

  // credential_endpoint and nonce_endpoint carry the full path, e.g.:
  //   http://certify-nginx:80/v1/certify/issuance/credential
  const rewritePath = (url: string | undefined) =>
    url?.replace(CERTIFY_INTERNAL_DOCKER + '/v1/certify', localCertifyHost) ?? url

  // credential_issuer is just the base, e.g.:
  //   http://certify-nginx:80
  const rewriteBase = (url: string | undefined) =>
    url?.replace(CERTIFY_INTERNAL_DOCKER, localCertifyHost) ?? url

  const result = { ...body }

  // Rewrite all internal Docker references to the public-facing BFF proxy
  result.credential_issuer = (typeof result.credential_issuer === 'string')
    ? rewriteBase(result.credential_issuer)
    : localCertifyHost
  result._internal_credential_issuer = result.credential_issuer
  result.credential_endpoint = (typeof result.credential_endpoint === 'string')
    ? rewritePath(result.credential_endpoint)
    : `${localCertifyHost}/issuance/credential`
  result.nonce_endpoint = (typeof result.nonce_endpoint === 'string')
    ? rewritePath(result.nonce_endpoint)
    : `${localCertifyHost}/issuance/nonce`
  if (!result.authorization_servers || !Array.isArray(result.authorization_servers) || result.authorization_servers.length === 0) {
    result.authorization_servers = [playgroundOidcUri]
  } else {
    result.authorization_servers = (result.authorization_servers as string[]).map(
      (url: string) =>
        url.replace(COLLAB_ESIGNET_PATTERN, playgroundOidcUri)
          .replace(/^http:\/\/[^/]+\/api\/oidc/, playgroundOidcUri)
          .replace('http://inji-playground:3001/api/oidc', playgroundOidcUri)
          .replace('http://localhost:3001/api/oidc', playgroundOidcUri)
          .replace('http://host.docker.internal:3001/api/oidc', playgroundOidcUri)
    )
  }

  // Ensure all 4 formats are supported in credential_configurations_supported
  const configs = (result.credential_configurations_supported as Record<string, any>) || {}

  if (!configs['FarmerCredential']) {
    configs['FarmerCredential'] = {
      format: 'ldp_vc',
      scope: 'mock_identity_vc_ldp',
      display: [{
        name: 'Farmer Verifiable Credential',
        locale: 'en',
        background_color: '#12107c',
        text_color: '#FFFFFF',
        logo: { url: 'https://mosip.github.io/inji-config/logos/agro-vertias-logo.png', alt_text: 'Farmer Logo' }
      }],
      order: ['fullName', 'mobileNumber', 'dateOfBirth', 'gender', 'state', 'district', 'villageOrTown', 'postalCode', 'landArea', 'landOwnershipType', 'primaryCropType', 'secondaryCropType', 'farmerID'],
      cryptographic_binding_methods_supported: ['did:jwk', 'did:key'],
      credential_signing_alg_values_supported: ['Ed25519Signature2020', 'EdDSA'],
      proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['RS256', 'ES256'] } },
      credential_definition: {
        type: ['FarmerCredential', 'VerifiableCredential'],
        '@context': ['https://www.w3.org/2018/credentials/v1']
      }
    }
  }

  if (!configs['FarmerCredential_SD_JWT']) {
    configs['FarmerCredential_SD_JWT'] = {
      format: 'vc+sd-jwt',
      scope: 'farmer_sd_jwt',
      vct: 'https://inji.mosip.io/credentials/farmer-identity',
      display: [{
        name: 'Farmer SD-JWT Credential',
        locale: 'en',
        background_color: '#1b4d3e',
        text_color: '#FFFFFF',
        logo: { url: 'https://mosip.github.io/inji-config/logos/agro-vertias-logo.png', alt_text: 'Farmer Logo' }
      }],
      order: ['fullName', 'mobileNumber', 'dateOfBirth', 'gender', 'state', 'district', 'villageOrTown', 'postalCode', 'landArea', 'landOwnershipType', 'primaryCropType', 'secondaryCropType', 'farmerID'],
      cryptographic_binding_methods_supported: ['did:jwk', 'did:key'],
      credential_signing_alg_values_supported: ['ES256'],
      proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['RS256', 'ES256'] } },
      claims: {
        fullName: { display: [{ name: 'Full Name', locale: 'en' }] },
        dateOfBirth: { display: [{ name: 'Date of Birth', locale: 'en' }] },
        gender: { display: [{ name: 'Gender', locale: 'en' }] },
        farmerID: { display: [{ name: 'Farmer ID', locale: 'en' }] },
        landArea: { display: [{ name: 'Land Area', locale: 'en' }] }
      }
    }
  }

  if (!configs['DrivingLicenseCredential']) {
    configs['DrivingLicenseCredential'] = {
      format: 'mso_mdoc',
      scope: 'sample_vc_mdoc',
      doctype: 'org.iso.18013.5.1.mDL',
      display: [{
        name: 'Mobile Driving License',
        locale: 'en',
        background_color: '#12107c',
        text_color: '#FFFFFF',
        logo: { url: 'https://api.collab.mosip.net/inji/mosip-logo.png', alt_text: 'DL Logo' }
      }],
      order: ['org.iso.18013.5.1~family_name', 'org.iso.18013.5.1~given_name', 'org.iso.18013.5.1~document_number', 'org.iso.18013.5.1~issue_date', 'org.iso.18013.5.1~expiry_date', 'org.iso.18013.5.1~issuing_country'],
      cryptographic_binding_methods_supported: ['cose_key', 'did:jwk', 'did:key'],
      credential_signing_alg_values_supported: ['ES256'],
      proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['RS256', 'ES256'] } },
      claims: {
        'org.iso.18013.5.1': {
          family_name: { display: [{ name: 'Family Name', locale: 'en' }] },
          given_name: { display: [{ name: 'Given Name', locale: 'en' }] },
          document_number: { display: [{ name: 'Document Number', locale: 'en' }] }
        }
      }
    }
  }

  result.credential_configurations_supported = configs
  return result
}

app.get('/api/playground-issuer/.well-known/openid-configuration', (_req, res) => {
  res.redirect('/api/oidc/.well-known/openid-configuration')
})

app.all('/api/local-certify/*splat', async (req, res) => {
  const path = splatPath(req)
  const isWellKnown = path.includes('.well-known')
  const baseUrl = getPublicBaseUrl(req)

  // 1. Metadata endpoints
  if (isWellKnown) {
    try {
      const result = await proxyRequest(
        ENDPOINTS.localCertify, path, req.method,
        req.headers as Record<string, string>, req.body,
      )
      if (typeof result.body === 'object' && result.body !== null) {
        return res.status(result.status).json(
          rewriteLocalCertifyMetadata(result.body as Record<string, unknown>, req)
        )
      }
    } catch {
      // Fallback if Docker is offline
      return res.json(rewriteLocalCertifyMetadata({}, req))
    }
    return res.json(rewriteLocalCertifyMetadata({}, req))
  }

  // 2. Nonce endpoint
  if (path.includes('/issuance/nonce') || path.includes('/nonce')) {
    const c_nonce = 'cnonce-' + crypto.randomBytes(16).toString('hex')
    return res.json({ c_nonce, c_nonce_expires_in: 3600 })
  }

  // 3. Credential issuance endpoint
  if (req.method === 'POST' && (path.includes('/issuance/credential') || path.includes('/credential'))) {
    const body = req.body || {}
    const format = body.format || body.credential_definition?.format
    const configId = body.credential_configuration_id || body.credential_definition?.type?.[0] || body.credential_identifier || ''
    const isSdJwt = format === 'vc+sd-jwt' || configId === 'FarmerCredential_SD_JWT' || String(body.vct).includes('farmer')
    const isMdoc = format === 'mso_mdoc' || configId === 'DrivingLicenseCredential' || body.doctype === 'org.iso.18013.5.1.mDL'

    // Extract holder binding from proof JWT if present
    let holderKey: any = null
    let holderDid: string | undefined
    if (body.proof?.jwt) {
      try {
        const decodedHeader = jose.decodeProtectedHeader(body.proof.jwt)
        if (decodedHeader.jwk) holderKey = { publicJwk: decodedHeader.jwk }
        if (typeof decodedHeader.kid === 'string') holderDid = decodedHeader.kid
        const decodedPayload = jose.decodeJwt(body.proof.jwt)
        if (typeof decodedPayload.iss === 'string') holderDid = decodedPayload.iss
      } catch { }
    }

    if (isSdJwt) {
      console.log('[local-certify] Issuing Farmer ID SD-JWT VC')
      const farmerClaims = {
        fullName: 'Gorge Cooper',
        farmerID: '2154189532',
        mobileNumber: '9876543210',
        dateOfBirth: '1990-05-25',
        gender: 'Male',
        state: 'Karnataka',
        district: 'Bangalore',
        villageOrTown: 'Koramangala',
        postalCode: '453000',
        landArea: '3 hectares',
        landOwnershipType: 'Owner',
        primaryCropType: 'Maize',
        secondaryCropType: 'Rice',
      }
      const sdjwt = await issueSdJwtCredential({
        issuerKey: localCertifyP256Key,
        issuerUrl: `${baseUrl}/api/local-certify`,
        vct: 'https://inji.mosip.io/credentials/farmer-identity',
        claims: farmerClaims,
        holderKey: holderKey || localCertifyP256Key,
        holderDid: holderDid || localCertifyP256Key.did,
      })
      return res.json({ credential: sdjwt.compact })
    }

    if (isMdoc) {
      console.log('[local-certify] Issuing Driving License ISO 18013-5 mDoc')
      const dlClaims = {
        family_name: 'Cooper',
        given_name: 'Gorge',
        birth_date: '1990-05-25',
        issue_date: '2023-01-15',
        expiry_date: '2033-01-15',
        issuing_country: 'IN',
        issuing_authority: 'Karnataka Transport Department',
        document_number: 'DL-5720110023456',
        driving_privileges: 'B',
      }
      const mdoc = await issueMdocCredential({
        issuerKey: localCertifyP256Key,
        issuerUrl: `${baseUrl}/api/local-certify`,
        docType: 'org.iso.18013.5.1.mDL',
        claims: dlClaims,
        holderKey: holderKey || localCertifyP256Key,
        holderDid: holderDid || localCertifyP256Key.did,
      })
      return res.json({ credential: mdoc.compact })
    }

    // Default: FarmerCredential (ldp_vc)
    try {
      const result = await proxyRequest(
        ENDPOINTS.localCertify, path, req.method,
        req.headers as Record<string, string>, req.body,
      )
      if (result.status >= 200 && result.status < 300) {
        return res.status(result.status).json(result.body)
      }
    } catch { }

    // Fallback if Docker is offline or error
    console.log('[local-certify] Issuing fallback FarmerCredential (LDP_VC)')
    const isVcdm2 = String(configId).includes('20') || String(configId).includes('2.0')
    const vc = await issueLdpCredential({
      key: localCertifyEdKey,
      dataModel: isVcdm2 ? '2.0' : '1.1',
      credentialType: 'FarmerCredential',
      subject: {
        fullName: 'Gorge Cooper',
        farmerID: '2154189532',
        mobileNumber: '9876543210',
        dateOfBirth: '25-05-1990',
        gender: 'Male',
        state: 'Karnataka',
        district: 'Bangalore',
        villageOrTown: 'Koramangala',
        postalCode: '453000',
        landArea: '3 hectares',
        landOwnershipType: 'Owner',
        primaryCropType: 'Maize',
        secondaryCropType: 'Rice',
      },
      holderDid: holderDid || localCertifyEdKey.did,
    })
    return res.json({ credential: vc })
  }

  // Generic proxy for any other endpoints
  try {
    const result = await proxyRequest(
      ENDPOINTS.localCertify, path, req.method,
      req.headers as Record<string, string>, req.body,
    )
    if (typeof result.body === 'string') {
      res.status(result.status).type(result.contentType || 'text/plain').send(result.body)
    } else {
      res.status(result.status).json(result.body)
    }
  } catch (err) {
    res.status(502).json({ error: 'Failed to reach Local Certify', detail: String(err) })
  }
})

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
  if (host === PLAYGROUND_ISSUER_ID || host === 'http://localhost:3001/api/playground-issuer') return
  if (host === 'http://localhost:3001/api/local-certify' || host === `${PUBLIC_BASE_URL}/api/local-certify`) return
  if (host.includes('/api/external/waltid/issuer')) return
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
    let credEndpoint = metadata.credential_endpoint as string
    let nonceEndpoint = metadata.nonce_endpoint as string
    if (credEndpoint?.includes('certify-nginx')) {
      credEndpoint = credEndpoint.replace('http://certify-nginx:80/v1/certify', issuerHost)
    }
    if (nonceEndpoint?.includes('certify-nginx')) {
      nonceEndpoint = nonceEndpoint.replace('http://certify-nginx:80/v1/certify', issuerHost)
    }
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


// ── walt.id OpenID4VCI external reference issuer ────────────────────────────
const WALTID_ISSUER_MOUNT = '/api/external/waltid/issuer'
const waltIdIssuer = await createWaltIdIssuer({ baseUrl: PUBLIC_BASE_URL, mountPath: WALTID_ISSUER_MOUNT })
app.use(WALTID_ISSUER_MOUNT, waltIdIssuer.router)

app.get(`/.well-known/openid-credential-issuer${WALTID_ISSUER_MOUNT}`, (_req, res) => {
  res.json(waltIdIssuer.issuerMetadata(_req))
})
app.get(`/.well-known/oauth-authorization-server${WALTID_ISSUER_MOUNT}`, (_req, res) => {
  res.json(waltIdIssuer.authorizationServerMetadata(_req))
})

// ── The playground's holder wallet ──────────────────────────────────────────
// Points at any OpenID4VCI issuer, not just ours, so the same step log can be
// compared across implementations.
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

// ── Frontend Routing ────────────────────────────────────────────────────────
// In development, the live React UI with hot-reload runs exclusively on Vite (port 3000).
// Port 3001 is the backend API server. If accessed in a browser, redirect to port 3000.
if (process.env.SERVE_STATIC === 'true') {
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

app.listen(PORT, () => {
  console.log(`[bff] Playground BFF running on http://localhost:${PORT}`)
  for (const { prefix, target } of PROXIES) console.log(`  ${prefix} → ${target}`)
  console.log(`[issuer] ${playgroundIssuer.identifier}`)
  console.log(`[issuer] signing did ${playgroundIssuer.key.did}`)
  console.log(`[wallet] holder did (issuance/P-256) ${playgroundWallet.key.did}`)
  console.log(`[wallet] holder did (presentation/Ed25519) ${playgroundWallet.presentationKey.did}`)
})
