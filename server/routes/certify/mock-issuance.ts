import crypto from 'crypto'
import type { Request, Response } from 'express'
import * as jose from 'jose'
import { ENDPOINTS } from '../../endpoints'
import { proxyRequest } from '../../proxy/http-proxy'
import { type PlaygroundKey } from '../../keys'
import { issueMdocCredential } from '../../formats/mdoc'
import { issueLdpCredential } from '../../formats/ldp'
import { issueSdJwtCredential } from '../../formats/sd-jwt'

export interface CertifyMockIssuanceParams {
  req: Request
  res: Response
  path: string
  baseUrl: string
  localCertifyEdKey: PlaygroundKey
  localCertifyP256Key: PlaygroundKey
  lastLocalCertifyConfigId: string
  onConfigIdUpdated?: (configId: string) => void
}

export async function handleCertifyMockIssuance(params: CertifyMockIssuanceParams): Promise<Response | void> {
  const {
    req,
    res,
    path,
    baseUrl,
    localCertifyEdKey,
    localCertifyP256Key,
    lastLocalCertifyConfigId,
    onConfigIdUpdated,
  } = params

  const body = req.body || {}
  const configId = String(
    body.credential_configuration_id || body.credential_definition?.type?.[0] || body.credential_identifier || ''
  ).toLowerCase()
  const rawConfigId =
    body.credential_configuration_id ||
    body.credential_definition?.type?.[0] ||
    body.credential_identifier ||
    lastLocalCertifyConfigId ||
    'FarmerCredential'

  onConfigIdUpdated?.(rawConfigId)
  const reqFormat = body.format || body.credential_definition?.format || ''

  const isSdJwt =
    reqFormat === 'vc+sd-jwt' ||
    configId.includes('sdjwt') ||
    configId.includes('sd-jwt') ||
    rawConfigId === 'FarmerCredential_SD_JWT' ||
    rawConfigId === 'farmer-sdjwt' ||
    String(body.vct).includes('farmer')

  const isMdoc =
    reqFormat === 'mso_mdoc' ||
    configId.includes('mdoc') ||
    configId.includes('mdl') ||
    rawConfigId === 'DrivingLicenseCredential' ||
    rawConfigId === 'local-mdoc' ||
    body.doctype === 'org.iso.18013.5.1.mDL'

  const isVcdm2 =
    configId.includes('20') ||
    configId.includes('2.0') ||
    rawConfigId === 'farmer-ldp-vcdm20' ||
    rawConfigId === 'FarmerCredential_VCDM2.0'

  let holderKey: any = null
  let holderDid: string | undefined
  const proofJwt = body.proof?.jwt || (body.proofs?.jwt && body.proofs.jwt[0])
  if (proofJwt) {
    try {
      const decodedHeader = jose.decodeProtectedHeader(proofJwt)
      if (decodedHeader.jwk) holderKey = { publicJwk: decodedHeader.jwk }
      if (
        typeof decodedHeader.kid === 'string' &&
        (decodedHeader.kid.startsWith('did:') || decodedHeader.kid.startsWith('urn:'))
      ) {
        holderDid = decodedHeader.kid
      }
      const decodedPayload = jose.decodeJwt(proofJwt)
      if (
        !holderDid &&
        typeof decodedPayload.iss === 'string' &&
        (decodedPayload.iss.startsWith('did:') || decodedPayload.iss.startsWith('urn:'))
      ) {
        holderDid = decodedPayload.iss
      }
    } catch {}
  }

  if (isSdJwt) {
    console.log('[local-certify] Issuing Farmer ID SD-JWT VC')
    const farmerClaims = {
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
    }
    const sdjwt = await issueSdJwtCredential({
      issuerKey: localCertifyP256Key,
      issuerUrl: `${baseUrl}/api/local-certify`,
      vct: 'https://inji.mosip.io/credentials/farmer-identity',
      claims: farmerClaims,
      holderKey: holderKey || localCertifyP256Key,
      holderDid: holderDid || localCertifyP256Key.did,
    })
    const c_nonce = 'cnonce-' + crypto.randomBytes(16).toString('hex')
    return res.json({
      format: 'vc+sd-jwt',
      credential: sdjwt.compact,
      credential_configuration_id: rawConfigId,
      credentialConfigurationId: rawConfigId,
      credential_issuer: `${baseUrl}/api/local-certify`,
      credentialIssuer: `${baseUrl}/api/local-certify`,
      c_nonce,
      c_nonce_expires_in: 3600,
    })
  }

  if (isMdoc) {
    console.log('[local-certify] Issuing Driving License ISO 18013-5 mDoc')
    const dlClaims = {
      family_name: 'Cooper',
      given_name: 'Gorge',
      birth_date: '1990-05-25',
      issue_date: '2023-01-15',
      expiry_date: '2033-01-15',
      issuing_country: 'IN',
      issuing_authority: 'Karnataka Transport Department',
      document_number: 'DL-5720110023456',
      driving_privileges: 'B',
    }
    const mdoc = await issueMdocCredential({
      issuerKey: localCertifyP256Key,
      issuerUrl: `${baseUrl}/api/local-certify`,
      docType: 'org.iso.18013.5.1.mDL',
      claims: dlClaims,
      holderKey: holderKey || localCertifyP256Key,
      holderDid: holderDid || localCertifyP256Key.did,
    })
    const c_nonce = 'cnonce-' + crypto.randomBytes(16).toString('hex')
    return res.json({
      format: 'mso_mdoc',
      credential: mdoc.compact,
      credential_configuration_id: rawConfigId,
      credentialConfigurationId: rawConfigId,
      credential_issuer: `${baseUrl}/api/local-certify`,
      credentialIssuer: `${baseUrl}/api/local-certify`,
      c_nonce,
      c_nonce_expires_in: 3600,
    })
  }

  // Default: FarmerCredential (ldp_vc)
  if (!isVcdm2) {
    try {
      const draft11Body: Record<string, any> = {
        format: 'ldp_vc',
        credential_definition: {
          type: ['FarmerCredential', 'VerifiableCredential'],
          '@context': ['https://www.w3.org/2018/credentials/v1'],
        },
        proof: body.proof || (proofJwt ? { proof_type: 'jwt', jwt: proofJwt } : undefined),
      }
      const result = await proxyRequest(
        ENDPOINTS.localCertify,
        path,
        req.method,
        req.headers as Record<string, string>,
        draft11Body,
      )
      if (result.status >= 200 && result.status < 300) {
        const bodyObj = typeof result.body === 'object' && result.body !== null ? (result.body as any) : {}
        return res.status(result.status).json({
          format: 'ldp_vc',
          credential: bodyObj.credential || result.body,
          credential_configuration_id: rawConfigId,
          credentialConfigurationId: rawConfigId,
          credential_issuer: `${baseUrl}/api/local-certify`,
          credentialIssuer: `${baseUrl}/api/local-certify`,
          c_nonce: bodyObj.c_nonce || 'cnonce-' + crypto.randomBytes(16).toString('hex'),
          c_nonce_expires_in: bodyObj.c_nonce_expires_in || 3600,
        })
      }
    } catch {}
  }

  // Fallback if Docker is offline or error
  console.log('[local-certify] Issuing fallback FarmerCredential (LDP_VC)')
  const host = baseUrl.replace(/^https?:\/\//, '').replace(/:/g, '%3A')
  const didWeb = `did:web:${host}`

  localCertifyEdKey.did = didWeb
  localCertifyEdKey.verificationMethod = `${didWeb}#key-0`
  if (localCertifyEdKey.signatureKeyPair) {
    localCertifyEdKey.signatureKeyPair.controller = didWeb
    localCertifyEdKey.signatureKeyPair.id = `${didWeb}#key-0`
  }

  const vc = await issueLdpCredential({
    key: localCertifyEdKey,
    dataModel: isVcdm2 ? '2.0' : '1.1',
    credentialType: 'FarmerCredential',
    subject: {
      fullName: 'Gorge Cooper',
      farmerID: '2154189532',
      mobileNumber: '9876543210',
      dateOfBirth: '25-05-1990',
      gender: 'Male',
      state: 'Karnataka',
      district: 'Bangalore',
      villageOrTown: 'Koramangala',
      postalCode: '453000',
      landArea: '3 hectares',
      landOwnershipType: 'Owner',
      primaryCropType: 'Maize',
      secondaryCropType: 'Rice',
    },
    holderDid: holderDid || localCertifyEdKey.did,
  })
  const c_nonce = 'cnonce-' + crypto.randomBytes(16).toString('hex')
  return res.json({
    format: 'ldp_vc',
    credential: vc,
    credential_configuration_id: rawConfigId,
    credentialConfigurationId: rawConfigId,
    credential_issuer: `${baseUrl}/api/local-certify`,
    credentialIssuer: `${baseUrl}/api/local-certify`,
    c_nonce,
    c_nonce_expires_in: 3600,
  })
}
