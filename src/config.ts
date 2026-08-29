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

export const issuers: IssuerConfig[] = [
  {
    id: 'certify-mock',
    name: 'Inji Certify (Mock Identity)',
    description: 'Collab mock issuer — advertises VCDM 1.1 and 2.0 configurations',
    host: COLLAB('mock'),
    credentialTypes: [mockLdp, mockLdp20],
  },
  {
    id: 'certify-farmer',
    name: 'Inji Certify (Farmer ID)',
    description: 'Farmer identity card, issued via the CSV data-provider plugin',
    host: COLLAB('farmer'),
    clientId: 'mpartner-default-mimoto-land-oidc',
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
    name: 'Inji Web',
    description: 'Browser-based wallet, Mimoto BFF',
  },
  {
    id: 'inji-mobile',
    name: 'Inji Wallet (Mobile)',
    description: 'React Native wallet, cross-device via QR',
  },
]

export const verifiers: VerifierConfig[] = [
  {
    id: 'inji-verify',
    name: 'Inji Verify',
    description: 'Collab verify-service, OpenID4VP v2 / DCQL',
  },
]
