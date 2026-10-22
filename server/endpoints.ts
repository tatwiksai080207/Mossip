import { env } from './config/env'

export const ENDPOINTS = env.endpoints

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

export const PROXIES: { prefix: string; target: string; label: string }[] = [
  { prefix: '/api/issuer', target: ENDPOINTS.issuer, label: 'issuer' },
  { prefix: '/api/esignet', target: ENDPOINTS.esignet, label: 'eSignet' },
  { prefix: '/api/esignet-mock', target: ENDPOINTS.esignetMock, label: 'eSignet (mock)' },
  { prefix: '/api/verifier', target: ENDPOINTS.verifier, label: 'verifier' },
  { prefix: '/api/mimoto', target: ENDPOINTS.mimoto, label: 'Mimoto' },
  { prefix: '/api/local-verifier', target: ENDPOINTS.localVerifier, label: 'Local Verifier' },
  // local-certify is handled with custom metadata rewriting
]
