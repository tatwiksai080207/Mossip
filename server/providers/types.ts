/**
 * Provider interface abstractions for Pluggable Issuers and Verifiers.
 * Enables zero-touch scalability for adding non-Inji and international identity providers.
 */

export type CredentialFormat = 'ldp_vc' | 'vc+sd-jwt' | 'mso_mdoc'

export interface IssueCredentialParams {
  baseUrl: string
  format: CredentialFormat
  credentialType: string
  holderDid: string
  proofJwt?: string
  claims?: Record<string, unknown>
}

export interface IssueCredentialResponse {
  format: CredentialFormat
  credential: unknown
  credential_configuration_id: string
  c_nonce: string
  c_nonce_expires_in: number
}

export interface VerificationRequestParams {
  baseUrl: string
  format: CredentialFormat
  requestedClaims?: string[]
}

export interface VerificationOutcome {
  verified: boolean
  providerId: string
  checks: {
    signature: boolean
    expiration?: boolean
    statusList?: boolean
    holderBinding?: boolean
  }
  claims?: Record<string, unknown>
  error?: string
}

export interface IssuerProvider {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly supportedFormats: CredentialFormat[]
  getMetadata(baseUrl: string): Promise<Record<string, unknown>>
  createOffer?(baseUrl: string, format?: CredentialFormat): Promise<Record<string, unknown>>
  issueCredential(params: IssueCredentialParams): Promise<IssueCredentialResponse>
}

export interface VerifierProvider {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly supportedFormats: CredentialFormat[]
  createRequest(params: VerificationRequestParams): Promise<Record<string, unknown>>
  verifyPresentation(presentationPayload: unknown, challengeNonce?: string): Promise<VerificationOutcome>
}
