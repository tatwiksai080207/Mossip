import type { IssuerConfig, WalletConfig, VerifierConfig, CredentialType } from './types'

// Issuers confirmed reachable in the Collab sandbox. Hosts and credential
// configuration ids were read from each issuer's live
// /.well-known/openid-credential-issuer; client ids come from Mimoto's
// /v2/issuers registry, which is also fetched at runtime to fill this out.

const COLLAB = (name: string) => `https://injicertify-${name}.collab.mosip.net`

const mockLdp: CredentialType = {
  id: 'mock-ldp-vcdm11',
  name: 'W3C VC 1.1 (JSON-LD)',
  format: 'ldp_vc',
  proofTypes: ['Ed25519Signature2020'],
  credentialTypeName: 'MockVerifiableCredential',
  vcTypes: ['VerifiableCredential', 'MockVerifiableCredential'],
  dataModel: '1.1',
}

const mockLdp20: CredentialType = {
  id: 'mock-ldp-vcdm20',
  name: 'W3C VC 2.0 (JSON-LD)',
  format: 'ldp_vc',
  proofTypes: ['Ed25519Signature2020'],
  credentialTypeName: 'MockVerifiableCredential_VCDM2.0',
  vcTypes: ['VerifiableCredential', 'MockVerifiableCredential'],
  dataModel: '2.0',
}

const playgroundLdp: CredentialType = {
  id: 'PlaygroundIdentityCredential',
  name: 'Playground Identity (W3C VC 1.1)',
  format: 'ldp_vc',
  proofTypes: ['Ed25519Signature2020'],
  credentialTypeName: 'PlaygroundIdentityCredential',
  vcTypes: ['VerifiableCredential', 'PlaygroundIdentityCredential'],
  dataModel: '1.1',
}

const playgroundLdp20: CredentialType = {
  id: 'PlaygroundIdentityCredential_VCDM2.0',
  name: 'Playground Identity (W3C VC 2.0)',
  format: 'ldp_vc',
  proofTypes: ['Ed25519Signature2020'],
  credentialTypeName: 'PlaygroundIdentityCredential',
  vcTypes: ['VerifiableCredential', 'PlaygroundIdentityCredential'],
  dataModel: '2.0',
}

const playgroundSdJwt: CredentialType = {
  id: 'PlaygroundIdentityCredential_SDJWT',
  name: 'Playground Identity (SD-JWT VC)',
  format: 'vc+sd-jwt',
  proofTypes: ['ES256'],
  credentialTypeName: 'PlaygroundIdentityCredential_SDJWT',
  vcTypes: ['PlaygroundIdentityCredential'],
  vct: 'https://inji-playground.mosip.dev/credentials/identity',
}

const waltIdLdp: CredentialType = {
  id: 'waltid-identity-ldp-vcdm11',
  name: 'walt.id Identity (W3C VC 1.1)',
  format: 'ldp_vc',
  proofTypes: ['Ed25519Signature2020'],
  credentialTypeName: 'waltid-identity-ldp-vcdm11',
  vcTypes: ['VerifiableCredential', 'PlaygroundIdentityCredential'],
  dataModel: '1.1',
}

const waltIdLdp20: CredentialType = {
  id: 'waltid-identity-ldp-vcdm20',
  name: 'walt.id Identity (W3C VC 2.0)',
  format: 'ldp_vc',
  proofTypes: ['Ed25519Signature2020'],
  credentialTypeName: 'waltid-identity-ldp-vcdm20',
  vcTypes: ['VerifiableCredential', 'PlaygroundIdentityCredential'],
  dataModel: '2.0',
}

const waltIdSdJwt: CredentialType = {
  id: 'waltid-identity-sdjwt',
  name: 'walt.id Identity (SD-JWT VC)',
  format: 'vc+sd-jwt',
  proofTypes: ['ES256'],
  credentialTypeName: 'waltid-identity-sdjwt',
  vcTypes: ['PlaygroundIdentityCredential'],
  vct: 'https://walt.id/credentials/identity',
}

export const issuers: IssuerConfig[] = [
  {
    id: 'certify-playground',
    name: 'Playground Issuer',
    description: 'Internal OpenID4VCI mock issuer — supports headless pre-authorized_code flow',
    host: 'http://localhost:3001/api/playground-issuer',
    env: 'mock',
    credentialTypes: [playgroundLdp, playgroundLdp20, playgroundSdJwt],
  },
  {
    id: 'issuer-waltid',
    name: 'walt.id Issuer',
    description: 'External reference issuer (OpenID4VCI) — issues W3C VCs & IETF SD-JWT VCs with pre-authorized_code flow',
    host: 'http://localhost:3001/api/external/waltid/issuer',
    env: 'external',
    credentialTypes: [waltIdLdp, waltIdLdp20, waltIdSdJwt],
  },
  {
    id: 'certify-local',
    name: 'Local Inji Certify',
    description: 'Local MOSIP Docker Stack — uses the Playground OIDC Provider for token exchange',
    host: 'http://localhost:3001/api/local-certify',
    clientId: 'playground-local-client',
    env: 'local',
    credentialTypes: [
      {
        id: 'farmer-ldp-vcdm11',
        name: 'W3C VC 1.1 (JSON-LD)',
        format: 'ldp_vc',
        proofTypes: ['Ed25519Signature2020'],
        credentialTypeName: 'FarmerCredential',
        vcTypes: ['VerifiableCredential', 'FarmerCredential'],
        dataModel: '1.1',
      },
      {
        id: 'farmer-ldp-vcdm20',
        name: 'W3C VC 2.0 (JSON-LD)',
        format: 'ldp_vc',
        proofTypes: ['Ed25519Signature2020'],
        credentialTypeName: 'FarmerCredential',
        vcTypes: ['VerifiableCredential', 'FarmerCredential'],
        dataModel: '2.0',
      }
    ],
  },
  {
    id: 'certify-mock',
    name: 'Inji Certify (Mock Identity)',
    description: 'Collab mock issuer — advertises VCDM 1.1 and 2.0 configurations',
    host: COLLAB('mock'),
    env: 'mock',
    credentialTypes: [mockLdp, mockLdp20],
  },
  {
    id: 'certify-farmer',
    name: 'Inji Certify (Farmer ID)',
    description: 'Farmer identity card, issued via the CSV data-provider plugin',
    host: COLLAB('farmer'),
    clientId: 'mpartner-default-mimoto-land-oidc',
    env: 'collab',
    credentialTypes: [
      {
        id: 'farmer-ldp-vcdm11',
        name: 'W3C VC 1.1 (JSON-LD)',
        format: 'ldp_vc',
        proofTypes: ['Ed25519Signature2020'],
        credentialTypeName: 'FarmerCredential',
        vcTypes: ['VerifiableCredential', 'FarmerCredential'],
        dataModel: '1.1',
      },
      {
        id: 'farmer-ldp-vcdm20',
        name: 'W3C VC 2.0 (JSON-LD)',
        format: 'ldp_vc',
        proofTypes: ['Ed25519Signature2020'],
        credentialTypeName: 'FarmerCredential_VCDM2.0',
        vcTypes: ['VerifiableCredential', 'FarmerCredential'],
        dataModel: '2.0',
      },
    ],
  },
  {
    id: 'certify-mosipid',
    name: 'Inji Certify (MOSIP National ID)',
    description: 'National ID credential, backed by eSignet + MOSIP IDA',
    host: COLLAB('mosipid'),
    clientId: 'mpartner-default-mimoto-mosipid-oidc',
    env: 'collab',
    credentialTypes: [
      {
        id: 'mosipid-ldp',
        name: 'W3C VC 1.1 (JSON-LD)',
        format: 'ldp_vc',
        proofTypes: ['Ed25519Signature2020'],
        credentialTypeName: 'MOSIPVerifiableCredential',
        vcTypes: ['VerifiableCredential', 'MOSIPVerifiableCredential'],
        dataModel: '1.1',
      },
    ],
  },
  {
    id: 'certify-mdl',
    name: 'Inji Certify (Mock mDL)',
    description: 'Driving licence as an ISO/IEC 18013-5 mDoc',
    host: COLLAB('mdl'),
    clientId: 'mpartner-default-mimoto-mdl-oidc',
    env: 'collab',
    credentialTypes: [
      {
        id: 'mdl-mdoc',
        name: 'mDoc / mDL (mso_mdoc)',
        format: 'mso_mdoc',
        proofTypes: ['ES256'],
        credentialTypeName: 'DrivingLicenseCredential',
      },
    ],
  },
  {
    id: 'certify-insurance',
    name: 'Inji Certify (StayProtected Insurance)',
    description: 'Sunbird RC backed insurance credential',
    host: COLLAB('insurance'),
    clientId: 'esignet-sunbird-partner',
    env: 'collab',
    credentialTypes: [
      {
        id: 'insurance-ldp',
        name: 'W3C VC 1.1 (JSON-LD)',
        format: 'ldp_vc',
        proofTypes: ['Ed25519Signature2020'],
        credentialTypeName: 'InsuranceCredential',
        vcTypes: ['VerifiableCredential', 'InsuranceCredential'],
        dataModel: '1.1',
      },
    ],
  },
]

export const wallets: WalletConfig[] = [
  {
    id: 'inji-web',
    name: 'Inji Web (Mock / Automated)',
    description: 'Browser-based wallet mock using internal BFF',
    env: 'local',
  },
  {
    id: 'inji-web-manual',
    name: 'Inji Web (Manual / Real App)',
    description: 'Generates an offer QR code for the real local Inji Web app',
    env: 'local',
  },
  {
    id: 'inji-mobile',
    name: 'Inji Wallet (Mobile)',
    description: 'React Native wallet, cross-device via QR',
    env: 'local',
  },
]

export const verifiers: VerifierConfig[] = [
  {
    id: 'inji-verify',
    name: 'Inji Verify',
    description: 'Collab verify-service, OpenID4VP v2 / DCQL',
    env: 'collab',
    host: '/api/verifier',
  },
  {
    id: 'verify-local',
    name: 'Local Inji Verify',
    description: 'Local MOSIP Docker Stack — running on port 8095',
    env: 'local',
    host: '/api/local-verifier',
  },
  {
    id: 'verify-waltid',
    name: 'walt.id Verifier',
    description: 'External reference verifier (OpenID4VP) — supports W3C VCs & SD-JWT VCs with did:key resolution',
    env: 'external',
    host: '/api/external/waltid/verifier',
  },
]
