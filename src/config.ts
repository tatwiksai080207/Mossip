import type { IssuerConfig, WalletConfig, VerifierConfig } from './types'

export const issuers: IssuerConfig[] = [
  {
    id: 'certify-farmer',
    name: 'Inji Certify (Farmer ID)',
    description: 'Issues Farmer Identity Card via CSV plugin',
    credentialTypes: [
      {
        id: 'farmer-ldp',
        name: 'W3C VC (JSON-LD)',
        format: 'ldp_vc',
        proofTypes: ['Ed25519Signature2020'],
      },
    ],
  },
  {
    id: 'certify-mock',
    name: 'Inji Certify (Mock Identity)',
    description: 'Mock identity issuer via Collab sandbox',
    credentialTypes: [
      {
        id: 'mock-ldp',
        name: 'W3C VC (JSON-LD)',
        format: 'ldp_vc',
        proofTypes: ['RsaSignature2018', 'Ed25519Signature2020'],
      },
      {
        id: 'mock-sdjwt',
        name: 'SD-JWT VC',
        format: 'vc+sd-jwt',
        proofTypes: ['ES256'],
      },
    ],
  },
]

export const wallets: WalletConfig[] = [
  {
    id: 'inji-web',
    name: 'Inji Web',
    description: 'Browser-based wallet',
  },
  {
    id: 'inji-mobile',
    name: 'Inji Mobile (via QR)',
    description: 'Mobile wallet with QR code scanning',
  },
]

export const verifiers: VerifierConfig[] = [
  {
    id: 'inji-verify',
    name: 'Inji Verify',
    description: 'Official Inji verification service',
  },
]
