import type { IssuerConfig, CredentialType } from './types'

// All calls go through our BFF proxy at /api/*

interface StepResult {
  payload: unknown
  source: 'live' | 'mock'
  error?: string
}

async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await fetch(url, { ...options, signal: controller.signal })
    return res
  } finally {
    clearTimeout(timeout)
  }
}

// Step 1: Fetch issuer metadata via BFF
export async function fetchIssuerMetadata(_issuer: IssuerConfig): Promise<StepResult> {
  try {
    const res = await safeFetch('/api/issuer/.well-known/openid-credential-issuer')
    if (res.ok) {
      const data = await res.json()
      return { payload: data, source: 'live' }
    }
    throw new Error(`HTTP ${res.status}`)
  } catch (err) {
    return {
      payload: {
        credential_issuer: 'https://injicertify-mock.collab.mosip.net',
        credential_endpoint: 'https://injicertify-mock.collab.mosip.net/v1/certify/issuance/credential',
        _fallback: true, _error: String(err),
      },
      source: 'mock', error: String(err),
    }
  }
}

// Step 2: Credential Offer — build from live metadata
export async function createCredentialOffer(_issuer: IssuerConfig, credType: CredentialType): Promise<StepResult> {
  try {
    // Fetch real metadata to build an accurate offer
    const res = await safeFetch('/api/issuer/.well-known/openid-credential-issuer')
    const metadata = res.ok ? await res.json() : null
    const offer = {
      credential_issuer: metadata?.credential_issuer || 'https://injicertify-mock.collab.mosip.net',
      credential_configuration_ids: [credType.id],
      grants: {
        'urn:ietf:params:oauth:grant-type:pre-authorized_code': {
          'pre-authorized_code': `pre-auth-${Date.now()}`,
          user_pin_required: false,
        },
      },
      _metadata_source: metadata ? 'live' : 'mock',
    }
    return { payload: offer, source: metadata ? 'live' : 'mock' }
  } catch {
    return {
      payload: {
        credential_issuer: 'https://injicertify-mock.collab.mosip.net',
        credential_configuration_ids: [credType.id],
        _fallback: true,
      },
      source: 'mock',
    }
  }
}

// Step 3: Token exchange — use BFF orchestrated flow to get nonce + build JWT proof
export async function exchangeToken(credType: CredentialType): Promise<StepResult> {
  try {
    const res = await safeFetch('/api/flow/issue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentialType: credType.id, format: credType.format }),
    })
    const data = await res.json()

    // Extract the nonce + proof steps from the orchestrated flow
    const nonceStep = data.steps?.find((s: { step: string }) => s.step === 'nonce')
    const proofStep = data.steps?.find((s: { step: string }) => s.step === 'proof')
    const keypairStep = data.steps?.find((s: { step: string }) => s.step === 'keypair')

    return {
      payload: {
        _flow: 'OpenID4VCI Pre-Authorized Code',
        holder_did: keypairStep?.data?.holderDid,
        c_nonce: nonceStep?.data?.c_nonce,
        c_nonce_source: 'live (from issuer nonce endpoint)',
        proof_jwt_built: proofStep?.status === 'ok',
        proof_algorithm: 'EdDSA',
        token_exchange_note: 'Using nonce-based proof instead of OAuth access token for mock issuance',
      },
      source: 'live',
    }
  } catch (err) {
    return {
      payload: {
        access_token: `mock-token-${Date.now()}`,
        token_type: 'Bearer',
        expires_in: 3600,
        _fallback: true,
      },
      source: 'mock', error: String(err),
    }
  }
}

// Step 4: Request credential — use BFF flow result
// IMPORTANT: If the sandbox returns 403/401, we throw to mark this step as FAILED
// rather than pretending it succeeded.
export async function requestCredential(credType: CredentialType): Promise<StepResult> {
  const res = await safeFetch('/api/flow/issue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ credentialType: credType.id, format: credType.format }),
  })
  const data = await res.json()
  const credStep = data.steps?.find((s: { step: string }) => s.step === 'credential')

  if (data.success && data.credential) {
    return { payload: data.credential, source: 'live' }
  }

  // If sandbox rejected us (403/401), report it honestly as an error
  // but include the full diagnostic so developers can see what happened
  const httpStatus = data.httpStatus || credStep?.data?.status || 'unknown'
  throw Object.assign(
    new Error(`Sandbox returned HTTP ${httpStatus} — OAuth access token required`),
    {
      stepPayload: {
        _sandbox_response: credStep?.data,
        _http_status: httpStatus,
        _all_steps: data.steps?.map((s: { step: string; status: string }) => `${s.step}: ${s.status}`),
        _note: httpStatus === 403
          ? 'Sandbox requires OAuth access token via eSignet. The nonce + JWT proof were generated correctly, but the credential endpoint enforces the full interactive OAuth flow (email OTP).'
          : `Sandbox returned HTTP ${httpStatus}`,
        _gap: 'No pre-authorized_code grant is available on the Collab mock issuer. A full eSignet interactive login (with dynamic email OTP) is required to obtain an access token.',
      },
    },
  )
}

// Step 5: VP authorization request
// Attempts to hit the real Inji Verify API to create an authorization request.
// Falls back to a well-structured mock if the API is unreachable.
export async function createVPRequest(credType: CredentialType): Promise<StepResult> {
  try {
    // Try the real Inji Verify API to create an authorization request session
    const res = await safeFetch('/api/verifier/v1/verify/vp-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId: `txn-${Date.now()}`,
        presentationDefinition: {
          id: `pd-${Date.now()}`,
          purpose: 'Verify credential for authentication',
          input_descriptors: [{
            id: 'credential-check',
            format: credType.format === 'vc+sd-jwt'
              ? { 'vc+sd-jwt': { alg: ['ES256'] } }
              : { ldp_vc: { proof_type: credType.proofTypes } },
            constraints: {
              fields: [{ path: ['$.type'], filter: { type: 'string', pattern: credType.id } }],
            },
          }],
        },
      }),
    })

    if (res.ok) {
      const data = await res.json()
      return { payload: data, source: 'live' }
    }

    // API returned an error — fall through to mock with the response info
    const errorBody = await res.json().catch(() => ({ error: res.statusText }))
    return {
      payload: {
        _api_attempted: true,
        _api_status: res.status,
        _api_response: errorBody,
        response_type: 'vp_token',
        client_id: 'did:web:inji-verify.collab.mosip.net',
        response_mode: 'direct_post',
        response_uri: 'https://api.collab.mosip.net/v1/verify/vp-submission',
        nonce: `vp-nonce-${Date.now()}`,
        presentation_definition: {
          id: `pd-${Date.now()}`,
          purpose: 'Verify credential for authentication',
          input_descriptors: [{
            id: 'credential-check',
            format: credType.format === 'vc+sd-jwt'
              ? { 'vc+sd-jwt': { alg: ['ES256'] } }
              : { ldp_vc: { proof_type: credType.proofTypes } },
            constraints: {
              fields: [{ path: ['$.type'], filter: { type: 'string', pattern: credType.id } }],
            },
          }],
        },
        _note: `Inji Verify API returned ${res.status}. Showing spec-compliant mock VP request.`,
      },
      source: 'mock',
    }
  } catch {
    return {
      payload: {
        _api_attempted: true,
        _api_error: 'unreachable',
        response_type: 'vp_token',
        client_id: 'did:web:inji-verify.collab.mosip.net',
        response_mode: 'direct_post',
        response_uri: 'https://api.collab.mosip.net/v1/verify/vp-submission',
        nonce: `vp-nonce-${Date.now()}`,
        presentation_definition: {
          id: `pd-${Date.now()}`,
          purpose: 'Verify credential for authentication',
          input_descriptors: [{
            id: 'credential-check',
            format: credType.format === 'vc+sd-jwt'
              ? { 'vc+sd-jwt': { alg: ['ES256'] } }
              : { ldp_vc: { proof_type: credType.proofTypes } },
            constraints: {
              fields: [{ path: ['$.type'], filter: { type: 'string', pattern: credType.id } }],
            },
          }],
        },
        _note: 'Inji Verify API unreachable. Showing spec-compliant mock VP request.',
      },
      source: 'mock',
    }
  }
}

// Step 6: VP token response
// In a real flow, the wallet would sign and submit a VP. Since we don't have
// a real wallet with an actual credential, we construct a spec-compliant mock.
export async function submitVPResponse(credType: CredentialType): Promise<StepResult> {
  const isLdp = credType.format !== 'vc+sd-jwt'

  // Try to submit to the real verifier endpoint
  try {
    const vpPayload = isLdp ? {
      vp_token: {
        '@context': ['https://www.w3.org/2018/credentials/v1'],
        type: ['VerifiablePresentation'],
        holder: `did:key:z6Mk${Date.now()}`,
        verifiableCredential: ['<no real credential — issuance was blocked by sandbox OAuth requirement>'],
      },
      presentation_submission: {
        id: `ps-${Date.now()}`,
        definition_id: `pd-${Date.now()}`,
        descriptor_map: [{
          id: 'credential-check',
          format: 'ldp_vp',
          path: '$',
        }],
      },
    } : {
      vp_token: `eyJhbGciOiJFUzI1NiJ9.mock-vp-no-real-credential.sig~disclosure~`,
      presentation_submission: {
        id: `ps-${Date.now()}`,
        definition_id: `pd-${Date.now()}`,
        descriptor_map: [{
          id: 'credential-check',
          format: 'vc+sd-jwt',
          path: '$',
        }],
      },
    }

    const res = await safeFetch('/api/verifier/v1/verify/vp-submission', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(vpPayload),
    })

    if (res.ok) {
      const data = await res.json()
      return { payload: { ...vpPayload, _verification_response: data }, source: 'live' }
    }

    const errorBody = await res.json().catch(() => ({ error: res.statusText }))
    return {
      payload: {
        ...vpPayload,
        _api_attempted: true,
        _api_status: res.status,
        _api_response: errorBody,
        _note: `VP submitted to Inji Verify but rejected (HTTP ${res.status}). This is expected because no real credential was issued (issuance blocked by OAuth requirement).`,
      },
      source: 'mock',
    }
  } catch {
    return {
      payload: {
        vp_token: isLdp ? {
          '@context': ['https://www.w3.org/2018/credentials/v1'],
          type: ['VerifiablePresentation'],
          holder: `did:key:z6Mk${Date.now()}`,
          verifiableCredential: ['<no real credential — issuance was blocked by sandbox OAuth requirement>'],
        } : `eyJhbGciOiJFUzI1NiJ9.mock-vp-no-real-credential.sig~disclosure~`,
        presentation_submission: {
          id: `ps-${Date.now()}`,
          definition_id: `pd-${Date.now()}`,
          descriptor_map: [{
            id: 'credential-check',
            format: isLdp ? 'ldp_vp' : 'vc+sd-jwt',
            path: '$',
          }],
        },
        _api_attempted: true,
        _api_error: 'unreachable',
        _note: 'Inji Verify API unreachable. Showing spec-compliant mock VP response.',
      },
      source: 'mock',
    }
  }
}

// Step 7: Verification — attempt real verification via Inji Verify API
export async function verifyPresentation(): Promise<StepResult> {
  try {
    // First check if verifier is reachable
    const healthRes = await safeFetch('/api/verifier/v1/verify/health')
    const verifierReachable = healthRes.ok

    // Try to get a verification result from a real endpoint
    const verifyRes = await safeFetch('/api/verifier/v1/verify/vp-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: `txn-${Date.now()}` }),
    })

    if (verifyRes.ok) {
      const data = await verifyRes.json()
      return { payload: data, source: 'live' }
    }

    // Verifier is reachable but didn't return a result (expected — we never submitted a real VP)
    const errorBody = await verifyRes.json().catch(() => ({ error: verifyRes.statusText }))
    return {
      payload: {
        verified: false,
        verifier_reachable: verifierReachable,
        _api_attempted: true,
        _api_status: verifyRes.status,
        _api_response: errorBody,
        _note: 'Verification could not be completed because no real credential was issued (sandbox requires interactive OAuth via eSignet). The verifier service is reachable and operational.',
        _gap: 'Full end-to-end verification requires: (1) completing eSignet OAuth to get an access token, (2) issuing a real VC, (3) signing a VP with the holder key, (4) submitting to Inji Verify.',
      },
      source: 'mock',
    }
  } catch {
    return {
      payload: {
        verified: false,
        verifier_reachable: false,
        _api_attempted: true,
        _api_error: 'unreachable',
        _note: 'Inji Verify service is unreachable. Cannot perform verification.',
      },
      source: 'mock',
    }
  }
}
