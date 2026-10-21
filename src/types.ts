// Credential format types supported by the Inji ecosystem
export type CredentialFormat = 'ldp_vc' | 'vc+sd-jwt' | 'mso_mdoc'

export interface CredentialType {
  id: string
  name: string
  format: CredentialFormat
  proofTypes: string[]
  /** The credential configuration id the issuer advertises, e.g. `FarmerCredential`. */
  credentialTypeName?: string
  /** Full `type` array for ldp_vc / jwt_vc, used to build a DCQL `type_values`. */
  vcTypes?: string[]
  /** SD-JWT VC type identifier, used to build a DCQL `vct_values`. */
  vct?: string
  /** VC Data Model version, so the report can distinguish 1.1 from 2.0 runs. */
  dataModel?: '1.1' | '2.0'
  /** mDoc doctype, e.g. `org.iso.18013.5.1.mDL`. */
  doctype?: string
}

// Issuer, wallet, verifier configs
export interface IssuerConfig {
  id: string
  name: string
  description: string
  credentialTypes: CredentialType[]
  /** Credential issuer base URL, e.g. `https://injicertify-farmer.collab.mosip.net`. */
  host?: string
  /** OIDC client the Collab sandbox has registered for this issuer, from Mimoto. */
  clientId?: string
  /** True for issuers discovered from Mimoto's registry rather than hardcoded. */
  fromRegistry?: boolean
  /** The environment/type of this service. */
  env?: 'local' | 'mock' | 'collab' | 'external'
}

export interface WalletConfig {
  id: string
  name: string
  description: string
  env?: 'local' | 'mock' | 'collab' | 'external'
}

export interface VerifierConfig {
  id: string
  name: string
  description: string
  env?: 'local' | 'mock' | 'collab' | 'external'
  /** The backend proxy path or URL for this verifier, e.g. /api/verifier */
  host?: string
}

// Test run config — what the user selects before running a test
export interface TestRunConfig {
  issuer: IssuerConfig
  wallet: WalletConfig
  verifier: VerifierConfig
  credentialType: CredentialType
  tamperMode?: 'none' | 'signature' | 'expired'
}

export interface NetworkEvent {
  method: string
  url: string
  path: string
  status: number
  latencyMs: number
  payloadSize: string
  timestamp: number
}

// Steps in the flow
export type FlowStep =
  | 'issuer-metadata'
  | 'credential-offer'
  | 'token-exchange'
  | 'credential-issuance'
  | 'vp-request'
  | 'vp-response'
  | 'verification'

export type StepStatus = 'pending' | 'running' | 'done' | 'error'

export interface FlowStepInfo {
  id: FlowStep
  label: string
  status: StepStatus
  payload?: unknown
  source?: 'live' | 'mock'
}

// A completed test run saved to history
export interface TestRun {
  id: string
  config: TestRunConfig
  steps: FlowStepInfo[]
  result: 'pass' | 'fail'
  timestamp: number
  version?: string
  durationMs?: number
}
