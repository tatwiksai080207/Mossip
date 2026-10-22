import type { IssuerConfig, WalletConfig, VerifierConfig, CredentialType } from './types'

// Issuers confirmed reachable in the Collab sandbox. Hosts and credential
// configuration ids were read from each issuer's live
// /.well-known/openid-credential-issuer; client ids come from Mimoto's
// /v2/issuers registry, which is also fetched at runtime to fill this out.

const COLLAB = (name: string) => `https://injicertify-${name}.collab.mosip.net`

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

const playgroundMdoc: CredentialType = {
  id: 'PlaygroundDrivingLicense_mDoc',
  name: 'Playground Driving Licence (mDoc / mDL)',
  format: 'mso_mdoc',
  proofTypes: ['ES256'],
  credentialTypeName: 'DrivingLicenseCredential',
  doctype: 'org.iso.18013.5.1.mDL',
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

const waltIdMdoc: CredentialType = {
  id: 'waltid-drivinglicense-mdoc',
  name: 'walt.id Driving Licence (mDoc / mDL)',
  format: 'mso_mdoc',
  proofTypes: ['ES256'],
  credentialTypeName: 'DrivingLicenseCredential',
  doctype: 'org.iso.18013.5.1.mDL',
}

export const issuers: IssuerConfig[] = [
  {
    id: 'certify-local',
    name: 'Local Inji Certify',
    description: 'MOSIP Docker container (port 8090)',
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
      },
      {
        id: 'farmer-sdjwt',
        name: 'Farmer ID (SD-JWT VC)',
        format: 'vc+sd-jwt',
        proofTypes: ['ES256'],
        credentialTypeName: 'FarmerCredential_SD_JWT',
        vct: 'https://inji.mosip.io/credentials/farmer-identity',
      },
      {
        id: 'local-mdoc',
        name: 'Driving Licence (mDoc / mDL)',
        format: 'mso_mdoc',
        proofTypes: ['ES256'],
        credentialTypeName: 'DrivingLicenseCredential',
        doctype: 'org.iso.18013.5.1.mDL',
      }
    ],
  },
  {
    id: 'certify-playground',
    name: 'Playground Mock',
    description: 'Fast headless mock issuer',
    host: 'http://localhost:3001/api/playground-issuer',
    env: 'mock',
    credentialTypes: [playgroundLdp, playgroundLdp20, playgroundSdJwt, playgroundMdoc],
  },
  {
    id: 'issuer-waltid',
    name: 'walt.id Issuer',
    description: 'External reference issuer',
    host: 'http://localhost:3001/api/external/waltid/issuer',
    env: 'external',
    credentialTypes: [waltIdLdp, waltIdLdp20, waltIdSdJwt, waltIdMdoc],
  },
  {
    id: 'certify-collab-interactive',
    name: 'Collab Inji Certify',
    description: 'MOSIP Collab cloud · eSignet OTP',
    host: COLLAB('mosipid'),
    clientId: 'mpartner-default-mimoto-mosipid-oidc',
    env: 'collab',
    credentialTypes: [
      {
        id: 'collab-mosipid-vcdm11',
        name: 'Veridonia National ID (W3C VC 1.1)',
        format: 'ldp_vc',
        proofTypes: ['Ed25519Signature2020'],
        credentialTypeName: 'MOSIPVerifiableCredential',
        vcTypes: ['VerifiableCredential', 'MOSIPVerifiableCredential'],
        dataModel: '1.1',
      },
      {
        id: 'collab-mosipid-vcdm20',
        name: 'Veridonia National ID (W3C VC 2.0)',
        format: 'ldp_vc',
        proofTypes: ['Ed25519Signature2020'],
        credentialTypeName: 'MOSIPVerifiableCredential_VCDM2.0',
        vcTypes: ['VerifiableCredential', 'MOSIPVerifiableCredential'],
        dataModel: '2.0',
      },
      {
        id: 'collab-mosipid-sdjwt',
        name: 'Veridonia National ID (SD-JWT VC)',
        format: 'vc+sd-jwt',
        proofTypes: ['ES256'],
        credentialTypeName: 'MOSIPVerifiableCredential_SD_JWT',
        vcTypes: ['MOSIPVerifiableCredential'],
        vct: 'https://inji.mosip.io/credentials/veridonia-id',
      },
      {
        id: 'collab-mosipid-mdoc',
        name: 'Veridonia National ID (mDoc / mDL)',
        format: 'mso_mdoc',
        proofTypes: ['ES256'],
        credentialTypeName: 'DrivingLicenseCredential',
        doctype: 'org.iso.18013.5.1.mDL',
      },
    ],
  },
]

export const wallets: WalletConfig[] = [
  {
    id: 'inji-web',
    name: 'Inji Web (Automated)',
    description: 'Headless browser mock',
    env: 'local',
  },
  {
    id: 'inji-wallet-interactive',
    name: 'Inji Wallet (Real App)',
    description: 'Inji Mobile QR or Inji Web',
    env: 'local',
  },
  {
    id: 'inji-web-collab-interactive',
    name: 'Inji Web (Collab)',
    description: 'Cloud web wallet · eSignet OTP',
    env: 'collab',
  },
]

export const verifiers: VerifierConfig[] = [
  {
    id: 'verify-local',
    name: 'Local Inji Verify',
    description: 'Docker container (port 8095)',
    env: 'local',
    host: '/api/local-verifier',
  },
  {
    id: 'inji-verify-collab-live',
    name: 'Collab Inji Verify',
    description: 'MOSIP Collab cloud engine',
    env: 'collab',
    host: '/api/verifier',
  },
  {
    id: 'verify-waltid',
    name: 'walt.id Verifier',
    description: 'External reference verifier',
    env: 'external',
    host: '/api/external/waltid/verifier',
  },
]
