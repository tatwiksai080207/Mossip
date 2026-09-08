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
import { issueMdocCredential } from './formats/mdoc'
import { issueLdpCredential, type DataModel } from './formats/ldp'
import { issueSdJwtCredential } from './formats/sd-jwt'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const app = express()
const PORT = Number(process.env.PORT || 3001)

// Override when a tunnel is fronting the BFF, so credential offers and QR codes
// carry a URL a phone can actually reach.
let activeTunnelUrl = process.env.PUBLIC_BASE_URL || 'https://e6d4-119-161-98-68.ngrok-free.app'

export function getPublicBaseUrl(req?: express.Request): string {
  if (req) {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http'
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host
    const isInternal = !host ||
      host.includes('localhost') ||
      host.includes('127.0.0.1') ||
      host.includes('host.docker.internal') ||
      host.includes('inji-playground') ||
      host.includes('verify-service') ||
      host.includes('certify') ||
      host.includes('mimoto') ||
      host.endsWith(':3001');
    if (!isInternal) {
      activeTunnelUrl = `${proto}://${host}`
      return activeTunnelUrl
    }
  }
  if (activeTunnelUrl) return activeTunnelUrl.replace(/\/$/, '')
  return `http://localhost:${PORT}`
}

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
  localVerifier: process.env.LOCAL_VERIFIER_URL || 'http://localhost:8095',
  localMimoto: process.env.LOCAL_MIMOTO_URL || 'http://localhost:8099/v1/mimoto',
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
    tunnelUrl: activeTunnelUrl,
  })
})

app.get('/api/tunnel', (_req, res) => {
  res.json({ tunnelUrl: activeTunnelUrl })
})

app.post('/api/tunnel', (req, res) => {
  if (req.body?.tunnelUrl) {
    activeTunnelUrl = req.body.tunnelUrl.replace(/\/$/, '')
  }
  res.json({ tunnelUrl: activeTunnelUrl })
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
      } catch {}
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
      resp.warningDomainName = activeTunnelUrl;
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
      for (const v of verifiers) {
        if (v.client_id === 'localhost-verifier' || v.client_id?.includes('ngrok')) {
          v.jwks_uri = `${activeTunnelUrl}/api/verifier/jwks.json`
          v.response_uris = [
            `${activeTunnelUrl}/v1/verify/v2/vp-submission/direct-post`,
            `${activeTunnelUrl}/v1/verify/vp-submission/direct-post`,
            'http://inji-playground:3001/v1/verify/v2/vp-submission/direct-post',
            'http://inji-playground:3001/v1/verify/vp-submission/direct-post',
            'http://verify-service:8080/v1/verify/v2/vp-submission/direct-post',
            'http://verify-service:8080/v1/verify/vp-submission/direct-post',
            'http://localhost:8095/v1/verify/v2/vp-submission/direct-post',
            'http://localhost:8095/v1/verify/vp-submission/direct-post',
          ]
        }
      }
      // Ensure Collab verifier is also in the list
      const hasCollab = verifiers.some((v: any) => v.client_id === 'injiverify.collab.mosip.net/')
      if (!hasCollab) {
        verifiers.push({
          client_id: 'injiverify.collab.mosip.net/',
          redirect_uris: ['https://injiverify.collab.mosip.net/'],
          response_uris: ['https://injiverify.collab.mosip.net/v1/verify/v2/vp-submission/direct-post'],
          jwks_uri: `${activeTunnelUrl}/api/verifier/jwks.json`,
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

async function handlePlaygroundIssuanceToMimoto(walletId: string, credentialConfigurationId: string, issuerId = 'Playground') {
  const credType = credentialConfigurationId || 'PlaygroundIdentityCredential'
  const isMdoc = credType.includes('mDoc') || credType.includes('DrivingLicense') || credType.toLowerCase().includes('mdoc')
  const isSdJwt = credType.includes('SDJWT') || credType.includes('sd-jwt')
  const isVcdm2 = credType.includes('2.0') || credType.includes('VCDM2.0')

  let compactCred = ''
  if (isMdoc) {
    const mdoc = await issueMdocCredential({
      issuerKey: playgroundIssuer.key,
      issuerUrl: `${getPublicBaseUrl()}/api/playground-issuer`,
      docType: 'org.iso.18013.5.1.mDL',
      claims: {
        family_name: 'Raghunathan',
        given_name: 'Asha',
        birth_date: '1991-07-14',
        issue_date: '2022-01-01',
        expiry_date: '2032-01-01',
        issuing_country: 'IN',
        issuing_authority: 'Karnataka Transport Department',
        document_number: 'DL-5720110023456',
        driving_privileges: ['B', 'A1'],
      },
    })
    compactCred = mdoc.compact
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
    const existing = await client.query(
      `SELECT id FROM public.verifiable_credentials WHERE wallet_id = $1 AND credential_metadata->>'credentialType' = $2`,
      [walletId, credType]
    )

    let credId: string
    if (existing.rows.length > 0) {
      credId = existing.rows[0].id
      await client.query(
        `UPDATE public.verifiable_credentials SET credential = $1, updated_at = now() WHERE id = $2`,
        [compactCred, credId]
      )
      console.log(`[wallet-bridge] Updated existing ${credType} ${credId} in wallet ${walletId}`)
    } else {
      credId = crypto.randomUUID()
      const metadata = JSON.stringify({ issuerId: issuerId || 'Playground', credentialType: credType })
      await client.query(
        `INSERT INTO public.verifiable_credentials (id, wallet_id, credential, credential_metadata, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())`,
        [credId, walletId, compactCred, metadata]
      )
      console.log(`[wallet-bridge] Inserted new ${credType} ${credId} into wallet ${walletId}`)
    }

    return { credentialId: credId }
  } finally {
    await client.end().catch(() => {})
  }
}

// Backward compatibility alias
const handleMdocIssuanceToMimoto = handlePlaygroundIssuanceToMimoto

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
  const pdfBuffer = isMdoc ? generateDrivingLicencePdf() : generateIdentityCredentialPdf(credType)
  const filename = isMdoc ? 'PlaygroundDrivingLicense_mDoc.pdf' : `${credType}.pdf`
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
  res.send(pdfBuffer)
})

// Mimoto proxy interceptors for wallet credentials
app.post('/v1/mimoto/wallets/:walletId/credentials', async (req, res, next) => {
  const { walletId } = req.params
  const configId = req.body?.credentialConfigurationId || req.body?.credential || ''
  const issuer = req.body?.issuer || 'Playground'
  const isPlayground = issuer === 'Playground' ||
                       configId.startsWith('Playground') ||
                       configId.toLowerCase().includes('mdoc') ||
                       configId.toLowerCase().includes('drivinglicense')

  if (isPlayground) {
    try {
      console.log(`[wallet-bridge] Intercepted Playground credential download for wallet ${walletId}, config: ${configId}`)
      const result = await handlePlaygroundIssuanceToMimoto(walletId, configId, issuer)
      return res.status(200).json({ response: result })
    } catch (err) {
      console.error('[wallet-bridge] Error issuing credential into mimoto DB:', err)
      return res.status(500).json({ error: 'Failed to issue credential into wallet', detail: String(err) })
    }
  }

  next()
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
      await client.end().catch(() => {})

      if (dbRes.rows.length > 0) {
        const credType = dbRes.rows[0].credential_metadata?.credentialType || ''
        const isMdoc = credType.includes('mDoc') || credType.includes('DrivingLicense') || credType.toLowerCase().includes('mdoc')
        const isPlayground = credType.startsWith('Playground') || isMdoc
        if (isPlayground) {
          const filename = isMdoc ? 'PlaygroundDrivingLicense_mDoc.pdf' : `${credType}.pdf`
          const pdfBuffer = isMdoc ? generateDrivingLicencePdf() : generateIdentityCredentialPdf(credType)
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

  const response = await fetch(url, options)
  const responseContentType = response.headers.get('content-type') || ''
  const isJson = responseContentType.includes('json')

  console.log(`[proxy] ${method} ${url} → ${response.status}`)

  return {
    status: response.status,
    contentType: responseContentType,
    headers: response.headers,
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
  { prefix: '/api/local-verifier', target: ENDPOINTS.localVerifier, label: 'Local Verifier' },
  // local-certify is handled below with metadata rewriting
]

for (const { prefix, target, label } of PROXIES) {
  app.all(`${prefix}/*splat`, async (req, res) => {
    try {
      const sPath = splatPath(req)
      let body = req.body
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
  if (typeof result.credential_issuer === 'string') {
    result.credential_issuer = rewriteBase(result.credential_issuer)
    result._internal_credential_issuer = result.credential_issuer
  }
  if (typeof result.credential_endpoint === 'string') {
    result.credential_endpoint = rewritePath(result.credential_endpoint)
  }
  if (typeof result.nonce_endpoint === 'string') {
    result.nonce_endpoint = rewritePath(result.nonce_endpoint)
  }
  if (Array.isArray(result.authorization_servers)) {
    result.authorization_servers = (result.authorization_servers as string[]).map(
      (url: string) =>
        url.replace(COLLAB_ESIGNET_PATTERN, playgroundOidcUri)
           .replace('http://inji-playground:3001/api/oidc', playgroundOidcUri)
           .replace('http://localhost:3001/api/oidc', playgroundOidcUri)
    )
  }

  return result
}

app.get('/api/playground-issuer/.well-known/openid-configuration', (_req, res) => {
  res.redirect('/api/oidc/.well-known/openid-configuration')
})

app.all('/api/local-certify/*splat', async (req, res) => {
  try {
    const path = splatPath(req)
    const result = await proxyRequest(
      ENDPOINTS.localCertify, path, req.method,
      req.headers as Record<string, string>, req.body,
    )

    // Only rewrite JSON responses for .well-known metadata endpoints
    const isWellKnown = path.includes('.well-known')
    if (isWellKnown && typeof result.body === 'object' && result.body !== null) {
      return res.status(result.status).json(
        rewriteLocalCertifyMetadata(result.body as Record<string, unknown>, req)
      )
    }

    if (typeof result.body === 'string') {
      res.status(result.status).type(result.contentType || 'text/plain').send(result.body)
    } else {
      res.status(result.status).json(result.body)
    }
  } catch (err) {
    console.error('[proxy] Local Certify error:', err)
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

// ── Serve React Frontend ────────────────────────────────────────────────────
// In production (e.g. inside Docker), the BFF serves the compiled React app
const distPath = path.join(__dirname, '../dist')
app.use(express.static(distPath))

app.get('/*splat', (_req, res) => {
  // If we get here and the file exists, send it (fallback for react-router)
  res.sendFile(path.join(distPath, 'index.html'))
})

app.listen(PORT, () => {
  console.log(`[bff] Playground BFF running on http://localhost:${PORT}`)
  for (const { prefix, target } of PROXIES) console.log(`  ${prefix} → ${target}`)
  console.log(`[issuer] ${playgroundIssuer.identifier}`)
  console.log(`[issuer] signing did ${playgroundIssuer.key.did}`)
  console.log(`[wallet] holder did (issuance/P-256) ${playgroundWallet.key.did}`)
  console.log(`[wallet] holder did (presentation/Ed25519) ${playgroundWallet.presentationKey.did}`)
})
