import { Router, type Request, type Response } from 'express'

export const keycloakMockRouter = Router()

// Mimoto's TokenHelper requires an internal Mosip service token to make outgoing
// OIDC requests. We mock the Keycloak discovery and token endpoints.
keycloakMockRouter.get('/auth/realms/*splat/.well-known/openid-configuration', (req: Request, res: Response) => {
  console.log('[MOCK-GET]', req.url)
  const baseUrl = `http://${req.headers.host}`
  const realmPath = `/auth/realms/${(req.params as any).splat}`
  res.json({
    issuer: `${baseUrl}${realmPath}`,
    token_endpoint: `${baseUrl}${realmPath}/protocol/openid-connect/token`,
    jwks_uri: `${baseUrl}${realmPath}/protocol/openid-connect/certs`,
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['RS256'],
  })
})

keycloakMockRouter.post('/auth/realms/*splat', (req: Request, res: Response) => {
  console.log('[MOCK-POST]', req.url)
  res.json({
    access_token:
      'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJtaW1vdG8iLCJjbGllbnRJZCI6Im1pbW90byIsInJvbGVzIjpbImFkbWluIl19.dummy',
    expires_in: 3600,
    refresh_expires_in: 0,
    token_type: 'Bearer',
    'not-before-policy': 0,
    scope: 'profile email',
  })
})
