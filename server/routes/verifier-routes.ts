import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { ENDPOINTS } from '../endpoints'
import { getActiveTunnelUrl, getPublicBaseUrl } from '../tunnel'
import { getActiveTamperMode, applyTamperingToVpToken } from '../tamper'
import { proxyRequest, splatPath } from '../proxy/http-proxy'

export function maybeRewriteAndSignVpRequestJwt(jwtStr: string): string {
  if (typeof jwtStr !== 'string' || !jwtStr.includes('.')) return jwtStr
  const parts = jwtStr.split('.')
  if (parts.length !== 3) return jwtStr
  try {
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf8'))
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    const activeTunnel = getActiveTunnelUrl().replace(/\/$/, '')
    let changed = false

    if (payload.response_uri) {
      const isInternal =
        payload.response_uri.includes('host.docker.internal') ||
        payload.response_uri.includes('localhost') ||
        payload.response_uri.includes('127.0.0.1') ||
        payload.response_uri.includes('verify-service')

      if (!isInternal) {
        console.log('[verifier-proxy] Serving native Inji Verify signed JWT without re-signing (response_uri:', payload.response_uri, ')')
        return jwtStr
      }

      if (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1')) {
        payload.response_uri = payload.response_uri.replace(/^https?:\/\/[^\/]+/, activeTunnel)
        changed = true
        console.log('[verifier-proxy] Fallback: Rewrote internal response_uri to active tunnel:', payload.response_uri)
      }
    }

    if (changed) {
      const privKey = crypto.createPrivateKey({
        key: {
          kty: 'OKP',
          crv: 'Ed25519',
          d: 'BOLjKdGvTf_uNoSW8dW6ZIRaUZ0_wTzu-LS3Rlcl4VI',
          x: 'YT6KJVovMxNYJ-gxCEa3C0lCy0BSWaPjp30_BWLOr_k',
        },
        format: 'jwk',
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

export const verifierRouter = Router()

// Expose /v1/verify on the root path for OpenID4VP request_uri and vp-submission direct_post
verifierRouter.all('/v1/verify/*splat', async (req: Request, res: Response) => {
  try {
    const path = '/v1/verify' + splatPath(req)
    let body = req.body
    const activeTamperMode = getActiveTamperMode()
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
      ENDPOINTS.localVerifier,
      path,
      req.method,
      req.headers as Record<string, string>,
      body,
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
      const respObj = typeof result.body === 'object' && result.body !== null ? { ...result.body } : {}
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
verifierRouter.get('/api/verifier/jwks.json', (_req: Request, res: Response) => {
  res.json({
    keys: [
      {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'YT6KJVovMxNYJ-gxCEa3C0lCy0BSWaPjp30_BWLOr_k',
        use: 'sig',
        kid: 'did:web:verify-service:v1:verify#key-0',
      },
      {
        kty: 'OKP',
        crv: 'Ed25519',
        x: 'YT6KJVovMxNYJ-gxCEa3C0lCy0BSWaPjp30_BWLOr_k',
        use: 'sig',
        kid: 'did:web:injiverify.collab.mosip.net:v1:verify#key-0',
      },
    ],
  })
})

// ── Mock v1 Verifier for the React SDK ──────────────────────────────────────
// The @mosip/react-inji-verify-sdk strictly expects the older v1 API (presentationDefinition)
// which has been removed from the Collab Sandbox. This mock satisfies its initialization
// step so the SDK successfully renders its OpenID4VP QR code in the UI for the demo video.
verifierRouter.post('/api/mock-verifier/authorization-request', (req: Request, res: Response) => {
  const transactionId = `mock-txn-${Date.now()}`
  const baseUrl = getPublicBaseUrl(req)
  res.json({
    transactionId,
    requestUri: `${baseUrl}/api/mock-verifier/request-object/${transactionId}`,
    client_id: 'did:web:mock-verifier.inji.playground',
  })
})

verifierRouter.get('/api/mock-verifier/status', (_req: Request, res: Response) => {
  res.json({ status: 'pending' })
})
