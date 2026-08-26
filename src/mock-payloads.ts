import type { CredentialType, IssuerConfig } from './types'

// Each function returns a realistic payload matching the OpenID4VCI / OpenID4VP spec

export function credentialOffer(issuer: IssuerConfig, credType: CredentialType) {
  return {
    credential_issuer: `https://injicertify-mock.collab.mosip.net`,
    credential_configuration_ids: [credType.id],
    grants: {
      'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
        'pre-authorized_code': `pre-auth-${Date.now()}`,
        user_pin_required: false,
      },
    },
  }
}

export function tokenResponse() {
  return {
    access_token: `eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.mock-access-token-${Date.now()}`,
    token_type: 'Bearer',
    expires_in: 3600,
    c_nonce: `nonce-${Date.now()}`,
    c_nonce_expires_in: 300,
  }
}

export function issuedCredential(credType: CredentialType) {
  if (credType.format === 'vc+sd-jwt') {
    return {
      format: 'vc+sd-jwt',
      credential: `eyJhbGciOiJFUzI1NiJ9.eyJ2Y3QiOiIke credType.id}","_sd":["x","y"]}.signature~disclosure1~disclosure2~`,
      _note: 'SD-JWT with selective disclosure',
    }
  }

  return {
    format: 'ldp_vc',
    credential: {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://inji.io/credentials/v1',
      ],
      type: ['VerifiableCredential', credType.id],
      issuer: 'did:web:injicertify-mock.collab.mosip.net',
      issuanceDate: new Date().toISOString(),
      credentialSubject: {
        id: `did:key:z6Mk${Date.now()}`,
        fullName: 'Jane Doe',
        dateOfBirth: '1992-03-15',
      },
      proof: {
        type: credType.proofTypes[0],
        created: new Date().toISOString(),
        proofPurpose: 'assertionMethod',
        verificationMethod: 'did:web:injicertify-mock.collab.mosip.net#key-0',
        proofValue: 'z58DAdFfa9SkqZMVPxAQp...mock',
      },
    },
  }
}

export function vpAuthorizationRequest(credType: CredentialType) {
  return {
    response_type: 'vp_token',
    client_id: 'did:web:inji-verify.collab.mosip.net:v1:verify',
    response_mode: 'direct_post',
    response_uri: 'https://inji-verify.collab.mosip.net/v1/verify/vp-submission',
    nonce: `vp-nonce-${Date.now()}`,
    presentation_definition: {
      id: `pd-${Date.now()}`,
      purpose: 'Verifier requests credential for authentication',
      input_descriptors: [
        {
          id: 'credential-check',
          format: credType.format === 'vc+sd-jwt'
            ? { 'vc+sd-jwt': { sd_jwt_alg_values: credType.proofTypes } }
            : { ldp_vc: { proof_type: credType.proofTypes } },
          constraints: {
            fields: [{
              path: credType.format === 'vc+sd-jwt' ? ['$.vct'] : ['$.type'],
              filter: { type: 'string', pattern: credType.id },
            }],
          },
        },
      ],
    },
  }
}

export function vpTokenResponse(credType: CredentialType) {
  return {
    vp_token: credType.format === 'vc+sd-jwt'
      ? 'eyJhbGciOiJFUzI1NiJ9.vp-payload.sig~disclosure1~'
      : {
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiablePresentation'],
          holder: `did:key:z6Mk${Date.now()}`,
          verifiableCredential: ['...embedded VC...'],
        },
    presentation_submission: {
      id: `ps-${Date.now()}`,
      definition_id: `pd-${Date.now()}`,
      descriptor_map: [{
        id: 'credential-check',
        format: credType.format === 'vc+sd-jwt' ? 'vc+sd-jwt' : 'ldp_vp',
        path: '$',
      }],
    },
  }
}

export function verificationResult() {
  return {
    verified: true,
    checks: {
      signature: 'valid',
      expiry: 'valid',
      issuer_trust: 'valid',
      revocation: 'not_revoked',
    },
  }
}
