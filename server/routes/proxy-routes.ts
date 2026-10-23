import { Router, type Request, type Response } from 'express'
import { PROXIES } from '../endpoints'
import { getActiveTunnelUrl } from '../tunnel'
import { getActiveTamperMode, applyTamperingToVpToken } from '../tamper'
import { proxyRequest, splatPath } from '../proxy/http-proxy'
import { maybeRewriteAndSignVpRequestJwt } from './verifier-routes'

export const standardProxyRouter = Router()

for (const { prefix, target, label } of PROXIES) {
  standardProxyRouter.all(`${prefix}/*splat`, async (req: Request, res: Response) => {
    try {
      const sPath = splatPath(req)
      let body = req.body
      const activeTamperMode = getActiveTamperMode()

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
        target,
        sPath,
        req.method,
        req.headers as Record<string, string>,
        body,
      )

      // Handle local verifier response URI rewrite and VP request JWT signing
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
          }
        } else if (sPath.includes('/vp-request/') && req.method === 'GET' && typeof result.body === 'string' && result.body.includes('.')) {
          const rewritten = maybeRewriteAndSignVpRequestJwt(result.body)
          return res.status(result.status).type('application/oauth-authz-req+jwt').send(rewritten)
        }
      }

      if (sPath.includes('vp-submission/direct-post') && result.status >= 200 && result.status < 300) {
        console.log(`[verifier-proxy] (${label}) Submission succeeded! Providing redirect_uri to Playground`)
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
      console.error(`[proxy] ${label} error:`, err)
      res.status(502).json({ error: `Failed to reach ${label}`, detail: String(err) })
    }
  })
}
