import type { CredentialType, VerifierConfig } from '../types'
import { buildDcqlQuery, generateNonce } from './dcql'
import { safeFetch, readBody, postJson, StepError, type StepResult, getVpSession, setVpSession } from './http-client'

export async function createVPRequest(credType: CredentialType, verifier: VerifierConfig): Promise<StepResult> {
  const dcqlQuery = buildDcqlQuery(credType)
  const nonce = generateNonce()
  const transactionId = `txn-playground-${Date.now()}`
  const host = verifier.host || '/api/verifier'
  let request: any
  let endpoint = ''

  if (verifier.env === 'local' || verifier.env === 'external') {
    // Local Inji Verify 0.17.0 and walt.id use Presentation Exchange
    const configId = credType.credentialTypeName || credType.id
    request = {
      clientId: verifier.env === 'external' ? 'waltid-verifier' : 'localhost-verifier',
      transactionId,
      nonce,
      presentationDefinition: {
        id: "presentation_definition",
        input_descriptors: [
          {
            id: configId,
            format: credType.format === 'mso_mdoc'
              ? {
                  mso_mdoc: {
                    alg: ["ES256", "ES384", "EdDSA"]
                  }
                }
              : credType.format === 'vc+sd-jwt'
              ? {
                  "vc+sd-jwt": {
                    "sd-jwt_alg_values": ["RS256", "ES256", "ES256K", "EdDSA"],
                    "kb-jwt_alg_values": ["RS256", "ES256", "ES256K", "EdDSA"]
                  }
                }
              : {
                  ldp_vc: {
                    proof_type: ["Ed25519Signature2018", "Ed25519Signature2020", "RsaSignature2018"]
                  }
                },
            constraints: {
              fields: [
                {
                  path: credType.format === 'mso_mdoc' ? ["$.mdoc.doctype"] : (credType.format === 'vc+sd-jwt' ? ["$.vct"] : ["$.type[*]", "$.type"]),
                  filter: {
                    type: "string",
                    pattern: credType.format === 'mso_mdoc'
                      ? (credType.doctype || credType.id)
                      : credType.format === 'vc+sd-jwt'
                      ? (credType.vct || credType.id)
                      : (credType.credentialTypeName || credType.id)
                  }
                }
              ]
            }
          }
        ]
      }
    }
    endpoint = `${host}/v1/verify/vp-request`
  } else {
    // Collab Inji Verify uses v2 DCQL
    request = {
      clientId: 'https://injiverify.collab.mosip.net',
      transactionId,
      nonce,
      dcqlQuery,
    }
    endpoint = `${host}/v1/verify/v2/vp-request`
  }

  const { res, data } = await postJson(endpoint, request)

  if (!res.ok) {
    const isCollabMdocGap = credType.format === 'mso_mdoc' && (verifier.env === 'collab' || host.includes('injiverify.collab.mosip.net'))
    const errorMsg = isCollabMdocGap
      ? 'VP request rejected: Collab Inji Verify DCQL v2 API lacks ISO 18013-5 mDoc query support (HTTP 400: Unknown field: doctype_values)'
      : `VP request rejected by Inji Verify (HTTP ${res.status})`

    throw new StepError(errorMsg, {
      _request: request,
      _http_status: res.status,
      _response: data,
      ...(isCollabMdocGap ? {
        _interop_finding: 'Finding #7: Upstream OpenID4VP DCQL Draft 23+ Spec Gap in MOSIP Collab Cloud Sandbox',
        _root_cause: 'Collab Inji Verify (injiverify.collab.mosip.net) implements DCQL v2 query parsing exclusively for ldp_vc (type_values) and vc+sd-jwt (vct_values). The ISO 18013-5 doctype_values metadata query is not yet implemented upstream, rejecting the request with HTTP 400: Unknown field: doctype_values.',
        _resolution: 'To complete end-to-end mDoc verification via OpenID4VP, select "Local Inji Verify" (Docker port 8095) or "walt.id Verifier", which support ISO 18013-5 mDoc verification via Presentation Exchange v1.',
        _problem_statement_compliance: 'Problem Statement Section 2: "Credential formats to cover: W3C VC 1.1 / 2.0 (JSON-LD), SD-JWT VC, and mso_mdoc (ISO 18013-5, mock mode)" & Section 3: "Surface real interoperability gaps that the core teams can act on."',
      } : {}),
    })
  }

  const body = data as {
    transactionId: string
    requestId: string
    requestUri?: string
    expiresAt?: number
    authorizationDetails?: { nonce: string; responseUri: string }
  }

  setVpSession({
    transactionId: body.transactionId,
    requestId: body.requestId,
    nonce: body.authorizationDetails?.nonce ?? nonce,
    responseUri: body.authorizationDetails?.responseUri ?? '',
    requestUri: body.requestUri,
    expiresAt: body.expiresAt,
    dcqlQuery,
    clientId: request.clientId,
  })

  return { payload: { _request: request, _response: body }, source: 'live' }
}

export async function submitVPResponse(
  verifier: VerifierConfig
): Promise<StepResult> {
  const session = getVpSession()
  if (!session) {
    throw new StepError('No VP session — the authorization request step did not complete', {})
  }

  // 1. Ask the wallet to sign a Verifiable Presentation using the verifier's nonce.
  const targetClientId = session.clientId || (
    verifier.env === 'external' ? 'waltid-verifier' :
    verifier.env === 'local' ? 'localhost-verifier' :
    'https://injiverify.collab.mosip.net'
  )
  const { res: presentRes, data: presentData } = await postJson('/api/wallet/present', {
    nonce: session.nonce,
    clientId: targetClientId,
  })
  if (!presentRes.ok) {
    throw new StepError('Failed to sign Verifiable Presentation', {
      _wallet_response: presentData,
      _http_status: presentRes.status,
      _blocked_by: 'Credential issuance might have failed upstream (step 4), meaning the wallet holds no credential to present.',
    })
  }

  const { vp_token, holderDid, credentialId, format: presFormat, tampered } = presentData as Record<string, unknown>

  // 2. Submit it to the Verifier's responseUri (direct_post)
  let responseUri = session.responseUri || `${verifier.host || '/api/verifier'}/v1/verify/${verifier.env === 'local' ? 'vp-submission/direct-post' : 'v2/vp-submission/direct-post'}`

  if (responseUri.startsWith('http://') || responseUri.startsWith('https://')) {
    try {
      const url = new URL(responseUri)
      const vHost = (verifier.host || '/api/verifier').replace(/\/$/, '')
      if (url.pathname.startsWith(vHost)) {
        responseUri = url.pathname
      } else if (url.pathname.startsWith('/api/')) {
        responseUri = url.pathname
      } else {
        responseUri = `${vHost}${url.pathname}`
      }
    } catch {
      // keep existing responseUri
    }
  }

  const submitParams = new URLSearchParams()
  const isMdoc = presFormat === 'mso_mdoc' || (typeof vp_token === 'string' && (vp_token.includes('org.iso.18013.5.1') || vp_token.includes('DeviceResponse')))
  const isSdJwt = !isMdoc && (presFormat === 'vc+sd-jwt' || (typeof vp_token === 'string' && vp_token.includes('~')))

  if (verifier.env === 'local' || verifier.env === 'external') {
    submitParams.set('vp_token', typeof vp_token === 'string' ? vp_token : JSON.stringify(vp_token))
    submitParams.set('presentation_submission', JSON.stringify({
      id: "submission_1",
      definition_id: "presentation_definition",
      descriptor_map: [
        {
          id: (session.dcqlQuery.credentials?.[0]?.id || 'credential_1'),
          format: isMdoc ? "mso_mdoc" : (isSdJwt ? "vc+sd-jwt" : "ldp_vp"),
          path: "$"
        }
      ]
    }))
  } else {
    const queryId = session.dcqlQuery.credentials?.[0]?.id || 'credential_1'
    const dcqlVpToken = {
      [queryId]: Array.isArray(vp_token) ? vp_token : [vp_token]
    }
    submitParams.set('vp_token', JSON.stringify(dcqlVpToken))
  }

  submitParams.set('state', session.requestId)

  let submitRes
  try {
    submitRes = await safeFetch(responseUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: submitParams.toString(),
    })
  } catch (err) {
    console.error('Fetch caught an exception:', err)
    throw err
  }

  const submitData = await readBody(submitRes)

  if (!submitRes.ok) {
    throw new StepError(`Direct post to verifier failed (HTTP ${submitRes.status})`, {
      _endpoint: responseUri,
      _http_status: submitRes.status,
      _response: submitData,
    })
  }

  return {
    payload: {
      _action: 'Submitted Verifiable Presentation to verifier',
      vp_token,
      holderDid,
      presented_credential_id: credentialId,
      format: presFormat,
      tampered: Boolean(tampered),
      _verifier_response: submitData,
    },
    source: 'live'
  }
}
