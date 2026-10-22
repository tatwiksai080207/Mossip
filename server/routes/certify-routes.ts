import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { ENDPOINTS } from '../endpoints'
import { getPublicBaseUrl } from '../tunnel'
import { proxyRequest, splatPath } from '../proxy/http-proxy'
import { buildDidDocument, buildJwks } from '../proxy/certify-proxy'
import { generateEd25519Key, generateP256Key, type PlaygroundKey } from '../keys'
import { rewriteLocalCertifyMetadata } from './certify/metadata'
import { handleCertifyMockIssuance } from './certify/mock-issuance'

export { rewriteLocalCertifyMetadata, handleCertifyMockIssuance }

export interface CertifyRouterResult {
  router: Router
  localCertifyEdKey: PlaygroundKey
  localCertifyP256Key: PlaygroundKey
}

export async function createCertifyRouter(): Promise<CertifyRouterResult> {
  const localCertifyEdKey = await generateEd25519Key(Buffer.from('mossip-certify-ed25519-seed-32b!'))
  const localCertifyP256Key = await generateP256Key()
  const router = Router()

  let lastLocalCertifyConfigId = 'FarmerCredential'

  router.get('/api/playground-issuer/.well-known/openid-configuration', (_req: Request, res: Response) => {
    res.redirect('/api/oidc/.well-known/openid-configuration')
  })

  const didDocumentHandler = (req: Request, res: Response) => {
    const baseUrl = getPublicBaseUrl(req)
    res.json(buildDidDocument({ baseUrl, localCertifyEdKey, localCertifyP256Key }))
  }

  router.get(
    [
      '/.well-known/did.json',
      '/did.json',
      '/api/local-certify/.well-known/did.json',
      '/api/local-certify/did.json',
    ],
    didDocumentHandler
  )

  const jwksHandler = (_req: Request, res: Response) => {
    res.json(buildJwks({ localCertifyP256Key, localCertifyEdKey }))
  }

  router.get(
    ['/.well-known/jwks.json', '/api/local-certify/.well-known/jwks.json', '/api/local-certify/jwks'],
    jwksHandler
  )

  router.get(
    ['/.well-known/jwt-issuer', '/api/local-certify/.well-known/jwt-issuer'],
    (req: Request, res: Response) => {
      const baseUrl = getPublicBaseUrl(req)
      res.json({
        issuer: `${baseUrl}/api/local-certify`,
        jwks_uri: `${baseUrl}/api/local-certify/.well-known/jwks.json`,
      })
    }
  )

  const localCertifyWellKnownHandler = async (req: Request, res: Response) => {
    try {
      const result = await proxyRequest(
        ENDPOINTS.localCertify,
        '/.well-known/openid-credential-issuer',
        req.method,
        req.headers as Record<string, string>,
        req.body,
      )
      if (typeof result.body === 'object' && result.body !== null) {
        return res.status(result.status).json(
          rewriteLocalCertifyMetadata(result.body as Record<string, unknown>, req, lastLocalCertifyConfigId)
        )
      }
    } catch {
      return res.json(rewriteLocalCertifyMetadata({}, req, lastLocalCertifyConfigId))
    }
    return res.json(rewriteLocalCertifyMetadata({}, req, lastLocalCertifyConfigId))
  }

  router.get(
    [
      '/.well-known/openid-credential-issuer',
      '/.well-known/openid-credential-issuer/api/local-certify',
      '/.well-known/openid-credential-issuer/*splat',
      '/.well-known/oauth-authorization-server/api/local-certify',
      '/.well-known/openid-configuration/api/local-certify',
      '/api/local-certify/.well-known/openid-credential-issuer',
      '/api/local-certify/.well-known/openid-configuration',
      '/api/local-certify/.well-known/oauth-authorization-server',
    ],
    localCertifyWellKnownHandler
  )

  router.post(['/api/local-certify/offer', '/api/local-certify/issuance/offer'], (req: Request, res: Response) => {
    const baseUrl = getPublicBaseUrl(req)
    const { configurationId = 'FarmerCredential' } = req.body || {}
    lastLocalCertifyConfigId = configurationId
    const preAuthorizedCode = 'preauth-' + crypto.randomBytes(16).toString('hex')
    const authServer = `${baseUrl}/api/oidc`
    const credentialOffer = {
      credential_issuer: `${baseUrl}/api/local-certify`,
      credential_configuration_ids: [configurationId],
      grants: {
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': preAuthorizedCode,
          authorization_server: authServer,
        },
        authorization_code: {
          authorization_server: authServer,
        },
      },
    }
    const credential_offer_uri = `openid-credential-offer://?credential_offer=${encodeURIComponent(
      JSON.stringify(credentialOffer)
    )}`
    console.log('[local-certify] Generated credential offer for', configurationId, 'preAuth:', preAuthorizedCode)
    res.json({
      credential_offer: credentialOffer,
      credential_offer_uri,
      expires_in: 3600,
    })
  })

  router.all('/api/local-certify/*splat', async (req: Request, res: Response) => {
    const path = splatPath(req)
    const baseUrl = getPublicBaseUrl(req)

    // Explicit DID document request
    if (path.includes('did.json')) {
      return didDocumentHandler(req, res)
    }

    // Explicit JWKS request
    if (path.includes('jwks')) {
      return jwksHandler(req, res)
    }

    // Explicit JWT issuer request
    if (path.includes('jwt-issuer')) {
      return res.json({
        issuer: `${baseUrl}/api/local-certify`,
        jwks_uri: `${baseUrl}/api/local-certify/.well-known/jwks.json`,
      })
    }

    const isWellKnown = path.includes('.well-known')

    // 1. Metadata endpoints
    if (isWellKnown) {
      try {
        const result = await proxyRequest(
          ENDPOINTS.localCertify,
          path,
          req.method,
          req.headers as Record<string, string>,
          req.body,
        )
        if (typeof result.body === 'object' && result.body !== null) {
          return res.status(result.status).json(
            rewriteLocalCertifyMetadata(result.body as Record<string, unknown>, req, lastLocalCertifyConfigId)
          )
        }
      } catch {
        return res.json(rewriteLocalCertifyMetadata({}, req, lastLocalCertifyConfigId))
      }
      return res.json(rewriteLocalCertifyMetadata({}, req, lastLocalCertifyConfigId))
    }

    // 2. Nonce endpoint
    if (path.includes('/issuance/nonce') || path.includes('/nonce')) {
      const c_nonce = 'cnonce-' + crypto.randomBytes(16).toString('hex')
      return res.json({ c_nonce, c_nonce_expires_in: 3600 })
    }

    // 3. Credential issuance endpoint
    if (req.method === 'POST' && (path.includes('/issuance/credential') || path.includes('/credential'))) {
      return handleCertifyMockIssuance({
        req,
        res,
        path,
        baseUrl,
        localCertifyEdKey,
        localCertifyP256Key,
        lastLocalCertifyConfigId,
        onConfigIdUpdated: (newConfigId) => {
          lastLocalCertifyConfigId = newConfigId
        },
      })
    }

    // Generic proxy for any other endpoints
    try {
      const result = await proxyRequest(
        ENDPOINTS.localCertify,
        path,
        req.method,
        req.headers as Record<string, string>,
        req.body,
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

  return { router, localCertifyEdKey, localCertifyP256Key }
}
