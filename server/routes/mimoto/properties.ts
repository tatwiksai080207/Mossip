/**
 * Mimoto Properties Enrichment Service
 *
 * Harmonizes the Spring Boot Mimoto container's native /allProperties payload
 * with dynamic runtime tunnel discovery and mobile sandbox safety configurations.
 *
 * Context & Architectural Rationale:
 * When testing OpenID4VCI and OpenID4VP with real mobile devices (Inji Mobile APK)
 * behind a public reverse proxy or tunnel (e.g. ngrok), the physical mobile wallet requires:
 * 1. `warningDomainName`: Must match the public tunnel domain to suppress the "Untrusted Domain" security banner.
 * 2. `disableCredentialOfferVcVerification`: In sandbox mode, bypasses production MOSIP Root CA x509 chain
 *    verification for self-issued local credentials (did:key / did:jwks / did:web).
 * 3. `cacheTTLInMilliSeconds`: Set to 1ms to ensure instant cache invalidation during iterative testing.
 * 4. `openid4vpClientValidation`: Enforces trusted verifier registry validation against /v1/mimoto/verifiers.
 */

export interface MimotoProperties {
  warningDomainName?: string
  cacheTTLInMilliSeconds?: string
  openid4vpClientValidation?: string
  disableCredentialOfferVcVerification?: boolean
  [key: string]: any
}

export function enrichMimotoProperties(
  containerProperties: MimotoProperties = {},
  activeTunnelUrl: string
): MimotoProperties {
  const sanitizedTunnel = (activeTunnelUrl || '').replace(/\/$/, '')

  return {
    ...containerProperties,
    // Dynamic public tunnel synchronization for external mobile device scanning
    warningDomainName: sanitizedTunnel || containerProperties.warningDomainName || 'http://localhost:8099',
    // Mobile client development cache invalidation
    cacheTTLInMilliSeconds: '1',
    // OpenID4VP trusted client registry enforcement
    openid4vpClientValidation: 'true',
    // Inji Mobile sandbox bypass of production MOSIP Root CA
    disableCredentialOfferVcVerification: true,
  }
}
