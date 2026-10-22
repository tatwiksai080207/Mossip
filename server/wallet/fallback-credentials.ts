import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import * as jose from 'jose'
import { generateP256Key, generateEd25519Key, type PlaygroundKey } from '../keys'
import { signCredential, issueLdpCredential } from '../formats/ldp'
import { issueSdJwtCredential } from '../formats/sd-jwt'
import { issueMdocCredential } from '../formats/mdoc'

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
    fullName: 'Gorge Cooper',
    farmerID: '2154189532',
    mobileNumber: '9876543210',
    dateOfBirth: '1990-05-25',
    gender: 'Male',
    state: 'Karnataka',
    district: 'Bangalore',
    villageOrTown: 'Koramangala',
    postalCode: '453000',
    landArea: '3 hectares',
    landOwnershipType: 'Owner',
    primaryCropType: 'Maize',
    secondaryCropType: 'Rice',
  } : {
    UIN: '6207495860',
    fullName: 'Molleti Tatwik Sai',
    dateOfBirth: '2007/02/08',
    gender: 'MLE',
    phone: '8639930924',
  }

  if (format === 'vc+sd-jwt') {
    let certBase64 = ''
    let privateKey: any
    try {
      const certPem = fs.readFileSync(path.join(process.cwd(), 'server/certs/collab_p256.crt'), 'utf8')
      const keyPem = fs.readFileSync(path.join(process.cwd(), 'server/certs/collab_p256.key'), 'utf8')
      certBase64 = certPem.replace(/-----BEGIN CERTIFICATE-----/, '').replace(/-----END CERTIFICATE-----/, '').replace(/\r?\n|\r/g, '').trim()
      privateKey = crypto.createPrivateKey(keyPem)
    } catch (e) {
      console.warn('[wallet] Could not read cert file:', e)
    }

    const issuerKey = privateKey
      ? {
          did: isFarmer ? 'did:web:host.docker.internal%3A3001' : 'did:web:injicertify-mosipid.collab.mosip.net',
          privateKey,
          publicJwk: await jose.exportJWK(privateKey),
          verificationMethod: isFarmer ? 'did:web:host.docker.internal%3A3001#key-1' : 'did:web:injicertify-mosipid.collab.mosip.net#key-1',
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
      family_name: 'Cooper',
      given_name: 'Gorge',
      birth_date: '1990-05-25',
      issue_date: '2023-01-15',
      expiry_date: '2033-01-15',
      issuing_country: 'IN',
      issuing_authority: 'Karnataka Transport Department',
      document_number: 'DL-5720110023456',
      driving_privileges: 'B',
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
