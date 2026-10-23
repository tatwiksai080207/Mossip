import { Router, type Request, type Response } from 'express'
import { ENDPOINTS } from '../endpoints'
import { getPublicBaseUrl, getActiveTunnelUrl } from '../tunnel'
import { proxyRequest, splatPath } from '../proxy/http-proxy'
import {
  generateDrivingLicencePdf,
  generateIdentityCredentialPdf,
  generateFarmerCredentialPdf,
} from './mimoto/pdf-generator'
import { getMimotoDbClient, handlePlaygroundIssuanceToMimoto } from './mimoto/db-bridge'
import { createMimotoPresentationRouter } from './mimoto/presentation-bridge'

export {
  generateDrivingLicencePdf,
  generateIdentityCredentialPdf,
  generateFarmerCredentialPdf,
  getMimotoDbClient,
  handlePlaygroundIssuanceToMimoto,
}

export const localMimotoHost = (ENDPOINTS.localMimoto || 'http://localhost:8099').replace(/\/v1\/mimoto\/?$/, '')

export interface MimotoRouterDeps {
  playgroundIssuer: any
  playgroundWallet: any
}

export function createMimotoRouter(deps: MimotoRouterDeps): Router {
  const { playgroundIssuer, playgroundWallet } = deps
  const router = Router()

  // ── Mimoto Properties & Dynamic Trusted Verifiers ────────────────────────
  router.get('/v1/mimoto/allProperties', async (req: Request, res: Response) => {
    try {
      const forwardHeaders = { ...req.headers }
      delete forwardHeaders['if-none-match']
      delete forwardHeaders['if-modified-since']
      const result = await proxyRequest(
        localMimotoHost,
        '/v1/mimoto/allProperties',
        'GET',
        forwardHeaders as Record<string, string>,
      )
      if (result.body && typeof result.body === 'object' && (result.body as any).response) {
        const resp = (result.body as any).response
        const activeTunnel = getActiveTunnelUrl().replace(/\/$/, '')
        resp.warningDomainName = activeTunnel
        resp.cacheTTLInMilliSeconds = '1'
        resp.openid4vpClientValidation = 'true'
        resp.disableCredentialOfferVcVerification = true
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      res.removeHeader('ETag')
      res.status(result.status === 304 ? 200 : result.status).json(result.body)
    } catch (err) {
      console.error('[proxy] /v1/mimoto/allProperties error:', err)
      res.status(502).json({ error: 'Failed to reach local mimoto', detail: String(err) })
    }
  })

  router.get('/v1/mimoto/verifiers', async (req: Request, res: Response) => {
    try {
      const forwardHeaders = { ...req.headers }
      delete forwardHeaders['if-none-match']
      delete forwardHeaders['if-modified-since']
      const result = await proxyRequest(
        localMimotoHost,
        '/v1/mimoto/verifiers',
        'GET',
        forwardHeaders as Record<string, string>,
      )
      if (result.body && typeof result.body === 'object' && (result.body as any).response?.verifiers) {
        const verifiers = (result.body as any).response.verifiers
        const activeTunnelUrl = getActiveTunnelUrl().replace(/\/$/, '')

        // Fallback safety synchronization: ensure dynamic tunnel URL is accepted if ngrok domain rotates
        if (activeTunnelUrl && !activeTunnelUrl.includes('localhost') && !activeTunnelUrl.includes('127.0.0.1')) {
          for (const v of verifiers) {
            if (v.client_id === 'localhost-verifier' || v.client_id === 'did:web:verify-service:v1:verify' || v.client_id === 'waltid-verifier') {
              if (Array.isArray(v.response_uris)) {
                const tunnelPost = `${activeTunnelUrl}/v1/verify/vp-submission/direct-post`
                const tunnelV2Post = `${activeTunnelUrl}/v1/verify/v2/vp-submission/direct-post`
                const waltidTunnelPost = `${activeTunnelUrl}/api/external/waltid/verifier/v1/verify/vp-submission/direct-post`
                if (v.client_id === 'waltid-verifier') {
                  if (!v.response_uris.includes(waltidTunnelPost)) v.response_uris.unshift(waltidTunnelPost)
                } else {
                  if (!v.response_uris.includes(tunnelPost)) v.response_uris.unshift(tunnelPost)
                  if (!v.response_uris.includes(tunnelV2Post)) v.response_uris.unshift(tunnelV2Post)
                }
              }
              if (Array.isArray(v.redirect_uris) && !v.redirect_uris.includes(activeTunnelUrl)) {
                v.redirect_uris.push(activeTunnelUrl)
              }
            }
          }
        }
        console.log(`[mimoto-proxy] Serving native Mimoto trusted verifiers registry (${verifiers.length} verifiers)`)
      }
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
      res.setHeader('Pragma', 'no-cache')
      res.setHeader('Expires', '0')
      res.removeHeader('ETag')
      res.status(result.status === 304 ? 200 : result.status).json(result.body)
    } catch (err) {
      console.error('[proxy] /v1/mimoto/verifiers error:', err)
      res.status(502).json({ error: 'Failed to reach local mimoto', detail: String(err) })
    }
  })

  // ── Direct Wallet Bridge Endpoints ───────────────────────────────────────
  router.post('/api/wallet-bridge/mimoto-credential', async (req: Request, res: Response) => {
    try {
      const { walletId, credentialConfigurationId, issuerId } = req.body || {}
      if (!walletId) {
        return res.status(400).json({ error: 'walletId is required' })
      }
      console.log(`[wallet-bridge] Bridge issuance request for wallet ${walletId}, configId: ${credentialConfigurationId}`)
      const result = await handlePlaygroundIssuanceToMimoto({
        walletId,
        credentialConfigurationId: credentialConfigurationId || 'PlaygroundDrivingLicense_mDoc',
        issuerId: issuerId || 'Playground',
        playgroundIssuer,
      })
      return res.status(200).json({ response: result })
    } catch (err) {
      console.error('[wallet-bridge] Bridge error:', err)
      return res.status(500).json({ error: 'Bridge failed', detail: String(err) })
    }
  })

  router.get('/api/wallet-bridge/credential-pdf', (req: Request, res: Response) => {
    const credType = (req.query.credType as string) || 'PlaygroundDrivingLicense_mDoc'
    const isMdoc = credType.includes('mDoc') || credType.includes('DrivingLicense') || credType.toLowerCase().includes('mdoc')
    const isFarmer = credType.includes('Farmer') || credType.toLowerCase().includes('farmer')
    const formatLabel =
      credType.includes('SD_JWT') || credType.includes('sd-jwt') || credType.includes('SDJWT')
        ? 'IETF SD-JWT VC'
        : credType.includes('2.0') || credType.includes('VCDM20')
        ? 'W3C Verifiable Credential 2.0 (JSON-LD)'
        : 'W3C Verifiable Credential 1.1 (JSON-LD)'
    const pdfBuffer = isMdoc
      ? generateDrivingLicencePdf()
      : isFarmer
      ? generateFarmerCredentialPdf({ formatLabel })
      : generateIdentityCredentialPdf(credType)
    const filename = isMdoc
      ? 'DrivingLicense_mDoc.pdf'
      : isFarmer
      ? credType.includes('SD_JWT')
        ? 'FarmerCredential_SD_JWT.pdf'
        : 'FarmerCredential.pdf'
      : `${credType}.pdf`
    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`)
    res.send(pdfBuffer)
  })

  // ── Mimoto Proxy Interceptors for Wallet Credentials ─────────────────────
  router.post('/v1/mimoto/wallets/:walletId/credentials', async (req: Request, res: Response, next) => {
    const walletId = String(req.params.walletId)
    const configId = req.body?.credentialConfigurationId || req.body?.credential || req.body?.credential_identifier || ''
    const issuer = req.body?.issuer || req.body?.issuerId || 'Playground'
    const isFarmer =
      issuer === 'Farmer' ||
      issuer.toLowerCase().includes('farmer') ||
      issuer.toLowerCase().includes('agri') ||
      configId.toLowerCase().includes('farmer')
    const isPlayground =
      issuer === 'Playground' ||
      issuer.toLowerCase().includes('playground') ||
      configId.startsWith('Playground') ||
      configId.toLowerCase().includes('mdoc') ||
      configId.toLowerCase().includes('drivinglicense') ||
      isFarmer

    // 1. Attempt genuine over-the-wire proxy to the real Mimoto container first
    try {
      const forwardHeaders = { ...req.headers }
      delete forwardHeaders['host']
      const proxyRes = await proxyRequest(
        localMimotoHost,
        `/v1/mimoto/wallets/${walletId}/credentials`,
        req.method,
        forwardHeaders as Record<string, string>,
        req.body,
      )
      if (proxyRes.status >= 200 && proxyRes.status < 300) {
        console.log(`[wallet-bridge] Real Mimoto service successfully handled credential issuance natively (HTTP ${proxyRes.status})`)
        return res.status(proxyRes.status).json(proxyRes.body)
      }
      console.log(`[wallet-bridge] Real Mimoto returned HTTP ${proxyRes.status}; falling back to local bridge handler`)
    } catch (proxyErr) {
      console.warn('[wallet-bridge] Direct proxy to Mimoto container failed, using fallback:', proxyErr)
    }

    // 2. Fallback bridge for headless / simulated environments
    if (isPlayground || isFarmer) {
      try {
        console.log(`[wallet-bridge] Bridge fallback active for wallet ${walletId}, config: ${configId}, issuer: ${issuer}`)
        const result = await handlePlaygroundIssuanceToMimoto({
          walletId,
          credentialConfigurationId: configId,
          issuerId: issuer,
          playgroundIssuer,
        })
        return res.status(200).json({ response: result })
      } catch (err) {
        console.error('[wallet-bridge] Error issuing credential into mimoto DB:', err)
        return res.status(500).json({ error: 'Failed to issue credential into wallet', detail: String(err) })
      }
    }

    next()
  })

  router.get('/v1/mimoto/wallets/:walletId/credentials', async (req: Request, res: Response) => {
    const walletId = String(req.params.walletId)
    try {
      const client = await getMimotoDbClient()
      const dbRes = await client.query(
        `SELECT id, credential_metadata FROM public.verifiable_credentials WHERE wallet_id = $1`,
        [walletId]
      )
      await client.end().catch(() => {})

      const credentials = dbRes.rows.map(row => {
        let meta = row.credential_metadata
        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta)
          } catch (e) {}
        }
        const credType = meta?.credentialType || meta?.credentialConfigurationId || ''
        const isFarmer = credType.includes('Farmer') || meta?.issuerId === 'Farmer'
        const isMdoc = credType.includes('mDoc') || credType.includes('DrivingLicense')

        const displayName =
          meta?.credentialTypeDisplayName ||
          (isFarmer ? 'Farmer Verifiable Credential' : isMdoc ? 'Mobile Driving License' : 'Playground Identity Credential')
        const logo =
          meta?.credentialTypeLogo ||
          (isFarmer
            ? 'https://mosip.github.io/inji-config/logos/agro-vertias-logo.png'
            : 'https://api.collab.mosip.net/inji/mosip-logo.png')

        return {
          credentialId: row.id,
          ...(meta || {}),
          credentialTypeDisplayName: displayName,
          credentialTypeLogo: logo,
        }
      })

      return res.status(200).json(credentials)
    } catch (err) {
      console.error('[wallet-bridge] Error fetching credentials list:', err)
      return res.status(500).json({ error: 'Failed to fetch credentials list', detail: String(err) })
    }
  })

  router.get('/v1/mimoto/wallets/:walletId/credentials/:credentialId', async (req: Request, res: Response, next) => {
    const walletId = String(req.params.walletId)
    const credentialId = String(req.params.credentialId)
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
          const isMdoc =
            credType.includes('mDoc') || credType.includes('DrivingLicense') || credType.toLowerCase().includes('mdoc')
          const isFarmer = credType.includes('Farmer') || credType.toLowerCase().includes('farmer')
          const isSupported = credType.startsWith('Playground') || isMdoc || isFarmer
          if (isSupported) {
            const filename = isMdoc ? 'PlaygroundDrivingLicense_mDoc.pdf' : isFarmer ? 'FarmerCredential.pdf' : `${credType}.pdf`
            const pdfBuffer = isMdoc
              ? generateDrivingLicencePdf()
              : isFarmer
              ? generateFarmerCredentialPdf()
              : generateIdentityCredentialPdf(credType)
            res.setHeader('Content-Type', 'application/pdf')
            res.setHeader('Content-Disposition', action === 'download' ? `attachment; filename="${filename}"` : `inline; filename="${filename}"`)
            return res.send(pdfBuffer)
          }
        }
      } catch (err) {
        console.warn('[wallet-bridge] PDF check error, falling back to proxy:', err)
      }
    }

    next()
  })

  router.get('/v1/mimoto/oauth2/authorize/google', (_req: Request, res: Response) => {
    res.redirect('http://localhost:8099/v1/mimoto/oauth2/authorize/google')
  })

  // ── OpenID4VP Presentation Bridge ────────────────────────────────────────
  router.use(
    createMimotoPresentationRouter({
      playgroundIssuer,
      playgroundWallet,
      localMimotoHost,
    })
  )

  // ── Mimoto Fallback Reverse Proxy ─────────────────────────────────────────
  router.all('/v1/mimoto/*splat', async (req: Request, res: Response) => {
    try {
      const path = '/v1/mimoto' + splatPath(req)
      const baseUrl = getPublicBaseUrl(req)
      const localCertifyHost = `${baseUrl}/api/local-certify`
      const result = await proxyRequest(
        localMimotoHost,
        path,
        req.method,
        req.headers as Record<string, string>,
        req.body,
      )
      const setCookie = result.headers?.get('set-cookie')
      if (setCookie) res.setHeader('set-cookie', setCookie)

      let body = result.body
      if (body && typeof body === 'object') {
        let bodyStr = JSON.stringify(body)
        bodyStr = bodyStr
          .replace(/http:\/\/certify-nginx:80/g, localCertifyHost)
          .replace(/http:\/\/certify-nginx/g, localCertifyHost)
          .replace(/http:\/\/localhost:8099/g, baseUrl)
          .replace(/http:\/\/127\.0\.0\.1:8099/g, baseUrl)
          .replace(/http:\/\/host\.docker\.internal:3001/g, baseUrl)
          .replace(/http:\/\/inji-playground:3001/g, baseUrl)
        body = JSON.parse(bodyStr)
      }

      if (typeof body === 'string') {
        res.status(result.status).type(result.contentType || 'text/plain').send(body)
      } else {
        res.status(result.status).json(body)
      }
    } catch (err) {
      console.error('[proxy] /v1/mimoto error:', err)
      res.status(502).json({ error: 'Failed to reach local mimoto', detail: String(err) })
    }
  })

  return router
}
