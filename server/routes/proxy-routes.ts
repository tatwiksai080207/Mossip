import { Router, type Request, type Response } from 'express'
import { PROXIES } from '../endpoints'
import { getActiveTunnelUrl } from '../tunnel'
import { getActiveTamperMode, applyTamperingToVpToken } from '../tamper'
import { proxyRequest, splatPath } from '../proxy/http-proxy'
import { maybeRewriteAndSignVpRequestJwt } from './verifier-routes'
import {
  formatMdocResponse,
  hasMdocResult,
  getMdocResult,
  setMdocResult,
  setMdocSession,
  getMdocSession,
} from '../proxy/verifier-proxy'
import { verifyMdocLocally } from '../formats/mdoc'

export const standardProxyRouter = Router()

for (const { prefix, target, label } of PROXIES) {
  standardProxyRouter.all(`${prefix}/*splat`, async (req: Request, res: Response) => {
    try {
      const sPath = splatPath(req)
      let body = req.body
      const activeTamperMode = getActiveTamperMode()

      // Intercept local verifier vp-result for mDoc
      if (prefix === '/api/local-verifier' && sPath.includes('/vp-result/') && req.method === 'GET') {
        const txnId = sPath.split('/').pop() || ''
        if (hasMdocResult(txnId)) {
          const mdocRes = getMdocResult(txnId)!
          console.log(`[local-verifier-mdoc] Returning verified mDoc result for txnId=${txnId}: ${mdocRes.verified ? 'SUCCESS' : 'FAILED'}`)
          return res.json(formatMdocResponse(txnId, mdocRes))
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
        target,
        sPath,
        req.method,
        req.headers as Record<string, string>,
        body,
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
              if (resp.requestId) setMdocSession(resp.requestId, sessionInfo)
              if (resp.transactionId) setMdocSession(resp.transactionId, sessionInfo)
            }
          }
        } else if (sPath.includes('/vp-request/') && req.method === 'GET' && typeof result.body === 'string' && result.body.includes('.')) {
          const rewritten = maybeRewriteAndSignVpRequestJwt(result.body)
          return res.status(result.status).type('application/oauth-authz-req+jwt').send(rewritten)
        } else if (sPath.includes('vp-submission/direct-post') && req.method === 'POST') {
          const isMdoc = String(body?.vp_token).includes('org.iso.18013.5.1') || String(body?.presentation_submission).includes('mso_mdoc')
          if (isMdoc) {
            const state = body?.state || (typeof body?.presentation_submission === 'string' ? JSON.parse(body.presentation_submission).id : undefined)
            const session = state ? getMdocSession(state) : undefined
            const effectiveToken = body?.vp_token
            const hasTamper = activeTamperMode !== 'none' || String(effectiveToken).includes('BAD_SIG') || String(effectiveToken).includes('tampered')
            let mdocResult: any
            if (hasTamper) {
              mdocResult = { verified: false, error: 'Signature verification failed (tampered proof)' }
            } else {
              mdocResult = await verifyMdocLocally(effectiveToken, { expectedNonce: session?.nonce })
            }
            const targetTxn = session?.transactionId || state
            if (targetTxn) setMdocResult(targetTxn, mdocResult)
            console.log(`[local-verifier-mdoc] Evaluated mDoc submission for txnId=${targetTxn}, verified=${mdocResult.verified}`)
          }
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
