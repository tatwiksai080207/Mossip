import type { Router } from 'express'
import type { PlaygroundKey } from '../keys'

export type StepStatus = 'ok' | 'failed' | 'skipped'

export interface WalletStep {
  step: string
  status: StepStatus
  /** Everything the inspector needs to show what actually went over the wire. */
  data: Record<string, unknown>
}

export interface HeldCredential {
  id: string
  format: string
  /** Credential Issuer Identifier it came from. */
  issuer: string
  credentialConfigurationId?: string
  /** Object for `ldp_vc`; a compact string for JWT-based formats. */
  credential: unknown
  types?: string[]
  holderDid: string
  receivedAt: number
}

export interface CredentialOffer {
  credential_issuer: string
  credential_configuration_ids: string[]
  grants?: Record<string, Record<string, unknown>>
}

export interface AcceptOfferResult {
  success: boolean
  steps: WalletStep[]
  credential?: HeldCredential
  error?: string
}

export interface Wallet {
  router: Router
  /** P-256 key — used for the OpenID4VCI proof-of-possession JWT. */
  key: PlaygroundKey
  /** Ed25519 key — used for signing Verifiable Presentations (Ed25519Signature2020). */
  presentationKey: PlaygroundKey
  credentials: () => HeldCredential[]
  acceptOffer: (
    input: unknown,
    opts?: {
      accessToken?: string
      txCode?: string
      authCode?: string
      clientId?: string
      codeVerifier?: string
      redirectUri?: string
    }
  ) => Promise<AcceptOfferResult>
}
