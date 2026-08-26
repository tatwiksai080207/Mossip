// Credential format types supported by the Inji ecosystem
export type CredentialFormat = 'ldp_vc' | 'vc+sd-jwt' | 'mso_mdoc'

export interface CredentialType {
  id: string
  name: string
  format: CredentialFormat
  proofTypes: string[]
}

// Issuer, wallet, verifier configs
export interface IssuerConfig {
  id: string
  name: string
  description: string
  credentialTypes: CredentialType[]
}

export interface WalletConfig {
  id: string
  name: string
  description: string
}

export interface VerifierConfig {
  id: string
  name: string
  description: string
}

// Test run config — what the user selects before running a test
export interface TestRunConfig {
  issuer: IssuerConfig
  wallet: WalletConfig
  verifier: VerifierConfig
  credentialType: CredentialType
}

// Steps in the flow
export type FlowStep =
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
}
