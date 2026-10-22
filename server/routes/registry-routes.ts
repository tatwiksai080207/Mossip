import { Router, type Request, type Response } from 'express'
import * as jose from 'jose'
import { ENDPOINTS } from '../endpoints'
import { getPublicBaseUrl } from '../tunnel'
import { proxyRequest } from '../proxy/http-proxy'

export interface RegistryIssuer {
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

export async function loadRegistry(): Promise<RegistryIssuer[]> {
  if (registryCache && Date.now() - registryCache.at < REGISTRY_TTL_MS) {
    return registryCache.issuers
  }

  const res = await fetch(`${ENDPOINTS.mimoto}/v2/issuers`)
  if (!res.ok) throw new Error(`Mimoto registry returned HTTP ${res.status}`)

  const raw = (await res.json()) as {
    response?: { issuers?: Record<string, unknown>[] }
  }

  const issuers: RegistryIssuer[] = (raw.response?.issuers || []).map(i => {
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

export async function assertAllowedIssuerHost(host: string) {
  const publicBaseUrl = getPublicBaseUrl()
  const playgroundIssuerId = `${publicBaseUrl}/api/playground-issuer`
  if (host === ENDPOINTS.issuer) return
  if (host === playgroundIssuerId || host === 'http://localhost:3001/api/playground-issuer') return
  if (host === 'http://localhost:3001/api/local-certify' || host === `${publicBaseUrl}/api/local-certify`) return
  if (host.includes('/api/external/waltid/issuer')) return
  const registry = await loadRegistry()
  if (!registry.some(i => i.credentialIssuerHost === host)) {
    throw new Error(`Issuer host not in Mimoto registry: ${host}`)
  }
}

export const registryRouter = Router()

registryRouter.get('/api/registry/issuers', async (_req: Request, res: Response) => {
  try {
    res.json({ issuers: await loadRegistry() })
  } catch (err) {
    console.error('[registry] error:', err)
    res.status(502).json({ error: 'Failed to load Mimoto issuer registry', detail: String(err) })
  }
})

registryRouter.get('/api/wellknown', async (req: Request, res: Response) => {
  const host = String(req.query.host || ENDPOINTS.issuer)
  try {
    await assertAllowedIssuerHost(host)
    const result = await proxyRequest(host, '/.well-known/openid-credential-issuer', 'GET', {})
    res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[wellknown] error:', err)
    res.status(400).json({ error: 'Failed to fetch issuer metadata', host, detail: String(err) })
  }
})

// ── OpenID4VCI issuance attempt against a real Collab issuer ────────────────
registryRouter.post('/api/flow/issue', async (req: Request, res: Response) => {
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
    const metadata = (await metadataRes.json()) as Record<string, unknown>
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
      const nonceData = (await nonceRes.json()) as Record<string, unknown>
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
