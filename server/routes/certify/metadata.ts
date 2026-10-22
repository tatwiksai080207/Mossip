import type express from 'express'
import { getPublicBaseUrl } from '../../tunnel'
import { CERTIFY_INTERNAL_DOCKER, COLLAB_ESIGNET_PATTERN } from '../../proxy/certify-proxy'

export function rewriteLocalCertifyMetadata(
  body: Record<string, unknown>,
  req?: express.Request,
  lastLocalCertifyConfigId = 'FarmerCredential'
): Record<string, unknown> {
  const baseUrl = getPublicBaseUrl(req)
  const localCertifyHost = `${baseUrl}/api/local-certify`
  const playgroundOidcUri = `${baseUrl}/api/oidc`

  const rewritePath = (url: string | undefined) =>
    url?.replace(CERTIFY_INTERNAL_DOCKER + '/v1/certify', localCertifyHost) ?? url

  const rewriteBase = (url: string | undefined) =>
    url?.replace(CERTIFY_INTERNAL_DOCKER, localCertifyHost) ?? url

  const result = { ...body }

  result.credential_issuer =
    typeof result.credential_issuer === 'string'
      ? rewriteBase(result.credential_issuer)
      : localCertifyHost
  result._internal_credential_issuer = result.credential_issuer
  result.credential_endpoint =
    typeof result.credential_endpoint === 'string'
      ? rewritePath(result.credential_endpoint)
      : `${localCertifyHost}/issuance/credential`
  result.nonce_endpoint =
    typeof result.nonce_endpoint === 'string'
      ? rewritePath(result.nonce_endpoint)
      : `${localCertifyHost}/issuance/nonce`

  if (!result.authorization_servers || !Array.isArray(result.authorization_servers) || result.authorization_servers.length === 0) {
    result.authorization_servers = [playgroundOidcUri]
  } else {
    result.authorization_servers = (result.authorization_servers as string[]).map((url: string) =>
      url
        .replace(COLLAB_ESIGNET_PATTERN, playgroundOidcUri)
        .replace(/^http:\/\/[^/]+\/api\/oidc/, playgroundOidcUri)
        .replace('http://inji-playground:3001/api/oidc', playgroundOidcUri)
        .replace('http://localhost:3001/api/oidc', playgroundOidcUri)
        .replace('http://host.docker.internal:3001/api/oidc', playgroundOidcUri)
    )
  }

  if (!result.display || !Array.isArray(result.display) || result.display.length === 0) {
    result.display = [
      {
        name: 'Inji Playground Local Certify',
        locale: 'en',
        logo: {
          url: 'https://mosip.github.io/inji-config/logos/agro-vertias-logo.png',
          alt_text: 'Local Certify Logo',
        },
      },
    ]
  } else if (Array.isArray(result.display) && result.display[0] && !result.display[0].logo) {
    result.display[0].logo = {
      url: 'https://mosip.github.io/inji-config/logos/agro-vertias-logo.png',
      alt_text: 'Local Certify Logo',
    }
  }

  const configs = ((result.credential_configurations_supported as Record<string, any>) || {})

  if (!configs['FarmerCredential']) {
    configs['FarmerCredential'] = {
      format: 'ldp_vc',
      scope: 'mock_identity_vc_ldp',
      display: [
        {
          name: 'Farmer Verifiable Credential',
          locale: 'en',
          background_color: '#12107c',
          text_color: '#FFFFFF',
          logo: { url: 'https://mosip.github.io/inji-config/logos/agro-vertias-logo.png', alt_text: 'Farmer Logo' },
        },
      ],
      order: [
        'fullName',
        'mobileNumber',
        'dateOfBirth',
        'gender',
        'state',
        'district',
        'villageOrTown',
        'postalCode',
        'landArea',
        'landOwnershipType',
        'primaryCropType',
        'secondaryCropType',
        'farmerID',
      ],
      cryptographic_binding_methods_supported: ['did:jwk', 'did:key'],
      credential_signing_alg_values_supported: ['Ed25519Signature2020', 'EdDSA'],
      proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['RS256', 'ES256'] } },
      credential_definition: {
        type: ['FarmerCredential', 'VerifiableCredential'],
        '@context': ['https://www.w3.org/2018/credentials/v1'],
      },
    }
  }

  if (!configs['FarmerCredential_SD_JWT']) {
    configs['FarmerCredential_SD_JWT'] = {
      format: 'vc+sd-jwt',
      scope: 'farmer_sd_jwt',
      vct: 'https://inji.mosip.io/credentials/farmer-identity',
      display: [
        {
          name: 'Farmer SD-JWT Credential',
          locale: 'en',
          background_color: '#1b4d3e',
          text_color: '#FFFFFF',
          logo: { url: 'https://mosip.github.io/inji-config/logos/agro-vertias-logo.png', alt_text: 'Farmer Logo' },
        },
      ],
      order: [
        'fullName',
        'mobileNumber',
        'dateOfBirth',
        'gender',
        'state',
        'district',
        'villageOrTown',
        'postalCode',
        'landArea',
        'landOwnershipType',
        'primaryCropType',
        'secondaryCropType',
        'farmerID',
      ],
      cryptographic_binding_methods_supported: ['did:jwk', 'did:key'],
      credential_signing_alg_values_supported: ['ES256'],
      proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['RS256', 'ES256'] } },
      claims: {
        fullName: { display: [{ name: 'Full Name', locale: 'en' }] },
        dateOfBirth: { display: [{ name: 'Date of Birth', locale: 'en' }] },
        gender: { display: [{ name: 'Gender', locale: 'en' }] },
        farmerID: { display: [{ name: 'Farmer ID', locale: 'en' }] },
        landArea: { display: [{ name: 'Land Area', locale: 'en' }] },
      },
    }
  }

  if (!configs['DrivingLicenseCredential']) {
    configs['DrivingLicenseCredential'] = {
      format: 'mso_mdoc',
      scope: 'sample_vc_mdoc',
      doctype: 'org.iso.18013.5.1.mDL',
      display: [
        {
          name: 'Mobile Driving License',
          locale: 'en',
          background_color: '#12107c',
          text_color: '#FFFFFF',
          logo: { url: 'https://api.collab.mosip.net/inji/mosip-logo.png', alt_text: 'DL Logo' },
        },
      ],
      order: [
        'org.iso.18013.5.1~family_name',
        'org.iso.18013.5.1~given_name',
        'org.iso.18013.5.1~document_number',
        'org.iso.18013.5.1~issue_date',
        'org.iso.18013.5.1~expiry_date',
        'org.iso.18013.5.1~issuing_country',
      ],
      cryptographic_binding_methods_supported: ['cose_key', 'did:jwk', 'did:key'],
      credential_signing_alg_values_supported: ['ES256'],
      proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['RS256', 'ES256'] } },
      claims: {
        'org.iso.18013.5.1': {
          family_name: { display: [{ name: 'Family Name', locale: 'en' }] },
          given_name: { display: [{ name: 'Given Name', locale: 'en' }] },
          document_number: { display: [{ name: 'Document Number', locale: 'en' }] },
        },
      },
    }
  }

  if (!configs['FarmerCredential_VCDM2.0']) {
    configs['FarmerCredential_VCDM2.0'] = {
      format: 'ldp_vc',
      scope: 'mock_identity_vc_ldp',
      display: [
        {
          name: 'Farmer Verifiable Credential (VC 2.0)',
          locale: 'en',
          background_color: '#12107c',
          text_color: '#FFFFFF',
          logo: { url: 'https://mosip.github.io/inji-config/logos/agro-vertias-logo.png', alt_text: 'Farmer Logo' },
        },
      ],
      order: [
        'fullName',
        'mobileNumber',
        'dateOfBirth',
        'gender',
        'state',
        'district',
        'villageOrTown',
        'postalCode',
        'landArea',
        'landOwnershipType',
        'primaryCropType',
        'secondaryCropType',
        'farmerID',
      ],
      cryptographic_binding_methods_supported: ['did:jwk', 'did:key'],
      credential_signing_alg_values_supported: ['Ed25519Signature2020', 'EdDSA'],
      proof_types_supported: { jwt: { proof_signing_alg_values_supported: ['RS256', 'ES256'] } },
      credential_definition: {
        type: ['FarmerCredential', 'VerifiableCredential'],
        '@context': ['https://www.w3.org/ns/credentials/v2'],
      },
    }
  }

  // Aliases for all 4 format keys so any client lookup matches
  configs['farmer-ldp-vcdm11'] = configs['FarmerCredential']
  configs['farmer-ldp-vcdm20'] = configs['FarmerCredential_VCDM2.0']
  configs['farmer-sdjwt'] = configs['FarmerCredential_SD_JWT']
  configs['local-mdoc'] = configs['DrivingLicenseCredential']

  result.issuer_id = 'local-certify'
  result.credential_issuer_host = localCertifyHost
  result.protocol = 'OpenId4VCI'
  result.client_id = 'wallet'
  result.redirect_uri = 'io.mosip.residentapp.inji://oauthredirect'

  let activeKey = lastLocalCertifyConfigId || 'FarmerCredential'
  let activeConfig = configs[activeKey]
  if (!activeConfig) {
    if (activeKey.includes('sdjwt') || activeKey.includes('sd-jwt')) activeConfig = configs['FarmerCredential_SD_JWT']
    else if (activeKey.includes('mdoc') || activeKey.includes('mdl')) activeConfig = configs['DrivingLicenseCredential']
    else if (activeKey.includes('20') || activeKey.includes('2.0')) activeConfig = configs['FarmerCredential_VCDM2.0']
    else activeConfig = configs['FarmerCredential']
  }
  configs[''] = {
    ...activeConfig,
    id: activeKey,
    credential_configuration_id: activeKey,
  }

  for (const [k, v] of Object.entries(configs)) {
    if (v && typeof v === 'object') {
      v.id = v.id || k
      v.credential_configuration_id = v.credential_configuration_id || k
    }
  }

  result.credential_configurations_supported = configs
  return result
}
