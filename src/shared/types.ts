/**
 * Shared domain contracts used across both frontend React application
 * and backend Express BFF server. Single source of truth.
 */

export type CredentialFormat = 'ldp_vc' | 'vc+sd-jwt' | 'mso_mdoc'
export type DataModel = '1.1' | '2.0'
export type TamperMode = 'none' | 'signature' | 'expired'
export type FlowStepStatus = 'pending' | 'running' | 'done' | 'error'

export type FlowStepId =
  | 'issuer-metadata'
  | 'credential-offer'
  | 'token-exchange'
  | 'credential-issuance'
  | 'vp-request'
  | 'vp-response'
  | 'verification'

export interface CredentialOfferPayload {
  credential_issuer: string
  credential_configuration_ids: string[]
  grants?: Record<string, Record<string, unknown>>
}

export interface HeldCredentialRecord {
  id: string
  format: string
  issuer: string
  credentialConfigurationId?: string
  credential: unknown
  types?: string[]
  holderDid: string
  receivedAt: number
}

export interface VerificationResultRecord {
  verified: boolean
  allChecksSuccessful: boolean
  claims?: Record<string, unknown>
  error?: string
  timestamp: number
}

export interface DiagnosticsServiceCheck {
  name: string
  url: string
  reachable: boolean
  status: number
  latencyMs: number
}
