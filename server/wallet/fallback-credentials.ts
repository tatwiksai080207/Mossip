import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import * as jose from 'jose'
import { generateP256Key, generateEd25519Key, type PlaygroundKey } from '../keys'
import { signCredential, issueLdpCredential } from '../formats/ldp'
import { issueSdJwtCredential } from '../formats/sd-jwt'
import { issueMdocCredential } from '../formats/mdoc'
import identities from '../config/identities.json'
import keysConfig from '../config/keys.json'

export interface FallbackCredentialOptions {
  format: string
  configurationId?: string
  config?: Record<string, unknown>
  issuerUrl: string
  holderKey: PlaygroundKey
  presentationKey: PlaygroundKey
}

export async function createFallbackResidentCredential(opts: FallbackCredentialOptions): Promise<unknown> {
  const { format, configurationId, config, issuerUrl, holderKey, presentationKey } = opts
  const isFarmer = issuerUrl.includes('farmer') || issuerUrl.includes('local-certify') || configurationId?.toLowerCase().includes('farmer')

  console.log(`[wallet] Issuing authentic ${isFarmer ? 'Farmer' : 'Resident'} credential for format: ${format}`)

  const residentClaims = isFarmer ? {
    fullName: identities.farmer.fullName,
    farmerID: identities.farmer.farmerId,
    mobileNumber: identities.farmer.mobileNumber,
    dateOfBirth: identities.farmer.dateOfBirth,
    gender: identities.farmer.gender,
    state: identities.farmer.state,
    district: identities.farmer.district,
    villageOrTown: identities.farmer.villageOrTown,
    postalCode: identities.farmer.postalCode,
    landArea: identities.farmer.landArea,
    landOwnershipType: identities.farmer.landOwnershipType,
    primaryCropType: identities.farmer.primaryCrop,
    secondaryCropType: identities.farmer.secondaryCrop,
  } : {
    UIN: identities.resident.uin,
    fullName: identities.resident.fullName,
    dateOfBirth: identities.resident.dateOfBirth,
    gender: identities.resident.gender,
    phone: identities.resident.phone,
  }

  if (format === 'vc+sd-jwt') {
    let certBase64 = ''
    let privateKey: any
    try {
      const certPem = fs.readFileSync(path.join(process.cwd(), keysConfig.collabCertificates.certRelativePath), 'utf8')
      const keyPem = fs.readFileSync(path.join(process.cwd(), keysConfig.collabCertificates.keyRelativePath), 'utf8')
      certBase64 = certPem.replace(/-----BEGIN CERTIFICATE-----/, '').replace(/-----END CERTIFICATE-----/, '').replace(/\r?\n|\r/g, '').trim()
      privateKey = crypto.createPrivateKey(keyPem)
    } catch (e) {
      console.warn('[wallet] Could not read cert file:', e)
    }

    let issuerHost = 'injicertify-mosipid.collab.mosip.net'
    try {
      issuerHost = new URL(issuerUrl).host
    } catch {}
    const dynamicDid = isFarmer ? 'did:web:host.docker.internal%3A3001' : `did:web:${encodeURIComponent(issuerHost)}`

    const issuerKey = privateKey
      ? {
          did: dynamicDid,
          privateKey,
          publicJwk: await jose.exportJWK(privateKey),
          verificationMethod: `${dynamicDid}#key-1`,
          x5c: [certBase64],
          alg: 'ES256',
        }
      : await generateP256Key()

    const sdJwt = await issueSdJwtCredential({
      issuerKey: issuerKey as any,
      issuerUrl,
      vct: (config?.vct as string) || (isFarmer ? 'https://inji.mosip.io/credentials/farmer-identity' : 'https://inji.mosip.io/credentials/veridonia-id'),
      claims: residentClaims,
      holderDid: holderKey.did,
      holderKey,
      x5c: certBase64 ? [certBase64] : undefined,
    })
    return sdJwt.compact
  }

  if (format === 'mso_mdoc') {
    const issuerKey = await generateP256Key()
    const dlClaims = isFarmer ? {
      family_name: identities.drivingLicense.familyName,
      given_name: identities.drivingLicense.givenName,
      birth_date: identities.drivingLicense.birthDate,
      issue_date: identities.drivingLicense.issueDate,
      expiry_date: identities.drivingLicense.expiryDate,
      issuing_country: identities.drivingLicense.issuingCountry,
      issuing_authority: identities.drivingLicense.issuingAuthority,
      document_number: identities.drivingLicense.documentNumber,
      driving_privileges: identities.drivingLicense.drivingPrivileges,
    } : residentClaims

    const mdoc = await issueMdocCredential({
      issuerKey,
      issuerUrl,
      docType: (config?.doctype as string) || 'org.iso.18013.5.1.mDL',
      claims: dlClaims,
      holderDid: holderKey.did,
      holderKey,
    })
    return mdoc.compact
  }

  // W3C VC JSON-LD
  const isVcdm20 = configurationId?.toLowerCase().includes('vcdm20') || configurationId?.includes('VCDM2.0') || config?.dataModel === '2.0'
  const issuerKey = await generateEd25519Key()

  if (isFarmer) {
    return issueLdpCredential({
      key: issuerKey,
      dataModel: isVcdm20 ? '2.0' : '1.1',
      credentialType: 'FarmerCredential',
      subject: {
        ...residentClaims,
        id: presentationKey.did,
      },
      holderDid: presentationKey.did,
    })
  }

  if (isVcdm20) {
    return issueLdpCredential({
      key: issuerKey,
      dataModel: '2.0',
      credentialType: 'MOSIPVerifiableCredential',
      subject: {
        UIN: '6207495860',
        fullName: [{ value: 'Molleti Tatwik Sai', language: 'eng' }],
        dateOfBirth: '2007/02/08',
        gender: [{ value: 'MLE', language: 'eng' }],
        phone: '8639930924',
      },
      holderDid: presentationKey.did,
      id: `https://mosip.io/credential/collab-molleti-${Date.now()}`,
    })
  }

  return signCredential({
    '@context': [
      'https://www.w3.org/2018/credentials/v1',
      'https://inji.github.io/inji-config/contexts/mosip-identity-context.json',
      'https://w3id.org/security/suites/ed25519-2020/v1',
    ],
    id: `https://mosip.io/credential/collab-molleti-${Date.now()}`,
    type: ['VerifiableCredential', 'MOSIPVerifiableCredential'],
    issuer: issuerKey.did,
    issuanceDate: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    expirationDate: new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    credentialSubject: {
      id: presentationKey.did,
      UIN: '6207495860',
      fullName: [{ value: 'Molleti Tatwik Sai', language: 'eng' }],
      dateOfBirth: '2007/02/08',
      gender: [{ value: 'MLE', language: 'eng' }],
      phone: '8639930924',
    },
  }, issuerKey)
}
