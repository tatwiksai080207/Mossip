import crypto from 'crypto'
import type { Request, Response } from 'express'
import * as jose from 'jose'
import { ENDPOINTS } from '../../endpoints'
import { proxyRequest } from '../../proxy/http-proxy'
import { type PlaygroundKey } from '../../keys'
import { issueMdocCredential } from '../../formats/mdoc'
import { issueLdpCredential } from '../../formats/ldp'
import { issueSdJwtCredential } from '../../formats/sd-jwt'
import { notifyFlowStep } from '../../events/flow-events'
import identities from '../../config/identities.json'

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

  // 1. Build authentic Draft 11 / Draft 13 request payload for Docker Inji Certify (port 8090)
  const draft11Body: Record<string, any> = {
    proof: body.proof || (proofJwt ? { proof_type: 'jwt', jwt: proofJwt } : undefined),
  }

  if (isSdJwt) {
    draft11Body.format = 'vc+sd-jwt'
    draft11Body.vct = body.vct || 'https://inji.mosip.io/credentials/farmer-identity'
  } else if (isMdoc) {
    draft11Body.format = 'mso_mdoc'
    draft11Body.doctype = body.doctype || 'org.iso.18013.5.1.mDL'
  } else {
    draft11Body.format = 'ldp_vc'
    draft11Body.credential_definition = body.credential_definition || {
      type: ['FarmerCredential', 'VerifiableCredential'],
      '@context': isVcdm2 ? ['https://www.w3.org/ns/credentials/v2'] : ['https://www.w3.org/2018/credentials/v1'],
    }
  }

  // 2. Prioritize authentic Docker Inji Certify container (Port 8090)
  try {
    const result = await proxyRequest(
      ENDPOINTS.localCertify,
      path,
      req.method,
      req.headers as Record<string, string>,
      draft11Body,
    )
    if (result.status >= 200 && result.status < 300) {
      console.log(`[local-certify] Successfully issued ${rawConfigId} (${draft11Body.format}) natively from Docker Inji Certify (port 8090)`)
      const bodyObj = typeof result.body === 'object' && result.body !== null ? (result.body as any) : {}
      const returnedFormat = isSdJwt ? 'vc+sd-jwt' : isMdoc ? 'mso_mdoc' : 'ldp_vc'
      notifyFlowStep('credential-issuance', 'done', {
        source: 'live_mobile',
        format: returnedFormat,
        configId: rawConfigId,
      })
      return res.status(result.status).json({
        format: returnedFormat,
        credential: bodyObj.credential || result.body,
        credential_configuration_id: rawConfigId,
        credentialConfigurationId: rawConfigId,
        credential_issuer: `${baseUrl}/api/local-certify`,
        credentialIssuer: `${baseUrl}/api/local-certify`,
        c_nonce: bodyObj.c_nonce || 'cnonce-' + crypto.randomBytes(16).toString('hex'),
        c_nonce_expires_in: bodyObj.c_nonce_expires_in || 3600,
      })
    }
    console.warn(`[local-certify] Docker returned status ${result.status} for ${rawConfigId}; invoking safe local fallback`)
  } catch (err) {
    console.warn(`[local-certify] Docker proxy failed (${err}); invoking safe local fallback`)
  }

  // 3. Graceful fallback if Docker container is unreachable or in non-2xx state
  if (isSdJwt) {
    console.log('[local-certify] Issuing fallback Farmer ID SD-JWT VC')
    const farmerClaims = {
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
    console.log('[local-certify] Issuing fallback Driving License ISO 18013-5 mDoc')
    const dlClaims = {
      family_name: identities.drivingLicense.familyName,
      given_name: identities.drivingLicense.givenName,
      birth_date: identities.drivingLicense.birthDate,
      issue_date: identities.drivingLicense.issueDate,
      expiry_date: identities.drivingLicense.expiryDate,
      issuing_country: identities.drivingLicense.issuingCountry,
      issuing_authority: identities.drivingLicense.issuingAuthority,
      document_number: identities.drivingLicense.documentNumber,
      driving_privileges: identities.drivingLicense.drivingPrivileges,
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
