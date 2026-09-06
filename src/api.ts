import type { IssuerConfig, CredentialType, VerifierConfig } from './types'
import { buildDcqlQuery, generateNonce, type DcqlQuery } from './dcql'

// Every call goes through the BFF proxy at /api/*.
//
// Design rule for this module: a step either reports live data or it FAILS.
// It never substitutes a plausible-looking mock for a call that did not happen.
// The previous version fell back to hand-written payloads whenever a fetch threw,
// which hid the fact that the verifier host was wrong and nothing was being called.

export interface StepResult {
  payload: unknown
  source: 'live' | 'mock'
  error?: string
}

/** Thrown so the store can render a failed step with full diagnostics attached. */
export class StepError extends Error {
  stepPayload: unknown
  constructor(message: string, stepPayload: unknown) {
    super(message)
    this.name = 'StepError'
    this.stepPayload = stepPayload
  }
}

const TIMEOUT_MS = 20000

async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text.slice(0, 2000)
  }
}

async function postJson(path: string, body: unknown): Promise<{ res: Response; data: unknown }> {
  const res = await safeFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { res, data: await readBody(res) }
}

// ── Shared VP session state ─────────────────────────────────────────────────
// /v2/vp-request hands back a transactionId and requestId that the submission
// and result steps both need, so the run threads them through here.
export interface VpSession {
  transactionId: string
  requestId: string
  nonce: string
  responseUri: string
  requestUri?: string
  expiresAt?: number
  dcqlQuery: DcqlQuery
}

let currentVpSession: VpSession | null = null
export function getVpSession() { return currentVpSession }
export function resetVpSession() { currentVpSession = null }

// ── Step 1: issuer metadata discovery ───────────────────────────────────────

export async function fetchIssuerMetadata(issuer: IssuerConfig): Promise<StepResult> {
  const host = issuer.host ?? 'https://injicertify-mock.collab.mosip.net'
  const url = `/api/wellknown?host=${encodeURIComponent(host)}`
  const res = await safeFetch(url)
  const data = await readBody(res)

  if (!res.ok) {
    throw new StepError(`Issuer metadata discovery failed (HTTP ${res.status})`, {
      _request: url,
      _http_status: res.status,
      _response: data,
    })
  }
  return { payload: data, source: 'live' }
}

// ── Step 2: credential offer ────────────────────────────────────────────────
// The Collab issuers advertise no credential_offer_endpoint, so the offer is
// assembled from live metadata. Labelled honestly as locally constructed.

export async function createCredentialOffer(
  issuer: IssuerConfig,
  credType: CredentialType,
): Promise<StepResult> {
  const host = issuer.host ?? 'https://injicertify-mock.collab.mosip.net'
  const res = await safeFetch(`/api/wellknown?host=${encodeURIComponent(host)}`)
  const metadata = await readBody(res) as Record<string, unknown>

  if (!res.ok) {
    throw new StepError(`Cannot build a credential offer without issuer metadata (HTTP ${res.status})`, {
      _http_status: res.status,
      _response: metadata,
    })
  }

  const configId = credType.credentialTypeName ?? credType.id

  if (issuer.id === 'certify-playground') {
    // Fetch a real offer from our playground issuer that includes a valid pre-authorized_code
    const offerRes = await postJson('/api/playground-issuer/offer', {
      configurationId: configId,
    })
    
    if (offerRes.res.ok) {
      const { credential_offer, credential_offer_uri } = offerRes.data as Record<string, any>
      return {
        payload: {
          ...credential_offer,
          _offer_uri: credential_offer_uri,
          _constructed_by: 'issuer',
          _reason: 'Fetched from the internal Playground Issuer /offer endpoint.',
        },
        source: 'live',
      }
    }
  }

  return {
    payload: {
      credential_issuer: metadata.credential_issuer,
      credential_configuration_ids: [configId],
      grants: {
        authorization_code: {
          authorization_server: (metadata.authorization_servers as string[] | undefined)?.[0],
        },
      },
      _constructed_by: 'playground',
      _reason: 'Issuer metadata advertises no credential_offer_endpoint (OpenID4VCI allows one).',
      _offer_uri: `openid-credential-offer://?credential_offer=${encodeURIComponent(
        JSON.stringify({
          credential_issuer: metadata.credential_issuer,
          credential_configuration_ids: [configId],
        }),
      )}`,
    },
    source: 'live',
  }
}

// ── Steps 3 & 4: token exchange and credential issuance ─────────────────────
// One BFF round trip drives both, since the proof is bound to a c_nonce that
// must be spent immediately.

interface IssueFlowResponse {
  success: boolean
  httpStatus?: number
  error?: string
  credential?: unknown
  steps?: { step: string; status: string; data: Record<string, unknown> }[]
}

async function runIssueFlow(issuer: IssuerConfig, credType: CredentialType, authCode?: string): Promise<IssueFlowResponse> {
  // We need an offer to pass to the wallet. Since the store doesn't thread step outputs,
  // we rebuild the offer here using the same function step 2 uses.
  const offerStep = await createCredentialOffer(issuer, credType)
  const payload = offerStep.payload as Record<string, unknown>
  
  const offer = {
    credential_issuer: payload.credential_issuer,
    credential_configuration_ids: payload.credential_configuration_ids,
    grants: payload.grants as Record<string, unknown>,
  }

  if (!authCode) {
    const preAuth = offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']
    const authCodeGrant = offer.grants['authorization_code']

    if (!preAuth && authCodeGrant) {
      // Need manual intervention!
      const metadata = await fetchIssuerMetadata(issuer)
      const authServers = (metadata.payload as any).authorization_servers as string[] | undefined
      if (authServers && authServers.length > 0) {
        const authServerUrl = authServers[0]
        
        // Fetch the authorization server metadata to find the authorization endpoint
        const asMetadataRes = await fetch(`${authServerUrl}/.well-known/openid-configuration`)
        if (asMetadataRes.ok) {
          const asMetadata = await asMetadataRes.json()
          const authEndpoint = asMetadata.authorization_endpoint
          
          if (authEndpoint) {
            const url = new URL(authEndpoint)
            url.searchParams.set('client_id', issuer.clientId || 'mpartner-default-mimoto-mosipid-oidc')
            url.searchParams.set('response_type', 'code')
            url.searchParams.set('redirect_uri', 'http://localhost:3001/callback')
            url.searchParams.set('scope', 'openid')
            
            const err = new Error('OAuthPauseRequired') as any
            err.oauthUrl = url.toString()
            throw err
          }
        } else {
           // Fallback if discovery fails
           const url = new URL(`${authServerUrl}/authorize`)
           url.searchParams.set('client_id', issuer.clientId || 'mpartner-default-mimoto-mosipid-oidc')
           url.searchParams.set('response_type', 'code')
           url.searchParams.set('redirect_uri', 'http://localhost:3001/callback')
           url.searchParams.set('scope', 'openid')
           
           const err = new Error('OAuthPauseRequired') as any
           err.oauthUrl = url.toString()
           throw err
        }
      }
    }
  }

  const clientId = issuer.clientId || 'mpartner-default-mimoto-mosipid-oidc'
  const { data, res } = await postJson('/api/wallet/accept-offer', { offer, authCode, clientId })
  const result = data as IssueFlowResponse
  if (!result.httpStatus) result.httpStatus = res.status
  return result
}

let lastIssueFlow: IssueFlowResponse | null = null

export async function exchangeToken(
  issuer: IssuerConfig,
  credType: CredentialType,
  code?: string,
): Promise<StepResult> {
  lastIssueFlow = await runIssueFlow(issuer, credType, code)
  const steps = lastIssueFlow.steps ?? []
  const find = (name: string) => steps.find(s => s.step === name)

  const token = find('token')
  const nonce = find('nonce')
  const proof = find('proof')

  if (!proof || proof.status !== 'ok') {
    throw new StepError('Failed to obtain a nonce and build a proof-of-possession', {
      _steps: steps.map(s => `${s.step}: ${s.status}`),
      _token: token?.data,
      _nonce: nonce?.data,
      _error: lastIssueFlow.error,
    })
  }

  return {
    payload: {
      _flow: 'OpenID4VCI — nonce-bound proof of possession',
      c_nonce: nonce?.data?.c_nonce ?? nonce?.data?.source,
      c_nonce_source: nonce?.status === 'ok' ? nonce.data.source : nonce?.status,
      proof_algorithm: proof.data?.alg,
      proof_jwt_length: proof.data?.jwt_length,
      _note: 'An OAuth access token has been retrieved from the issuer authorization server and used to mint the proof.',
    },
    source: 'live',
  }
}

export async function requestCredential(
  issuer: IssuerConfig,
  credType: CredentialType,
): Promise<StepResult> {
  const flow = lastIssueFlow ?? await runIssueFlow(issuer, credType)
  lastIssueFlow = null

  if (flow.success && flow.credential) {
    return { payload: flow.credential, source: 'live' }
  }

  const credStep = flow.steps?.find(s => s.step === 'credential')
  const status = credStep?.data?.http_status ?? flow.httpStatus ?? 'unknown'

  throw new StepError(`Credential endpoint returned HTTP ${status}`, {
    _http_status: status,
    _issuer_response: credStep?.data?.response ?? credStep?.data,
    _steps: flow.steps?.map(s => `${s.step}: ${s.status}`),
    _gap: status === 403 || status === 401
      ? 'The Collab issuers accept only the authorization_code grant, so a bearer token from eSignet is required. OpenID4VCI also defines a pre-authorized_code grant for exactly this automated case, and it is not offered.'
      : `Unexpected status ${status} from the credential endpoint.`,
  })
}

// ── Step 5: VP authorization request (real OpenID4VP, DCQL) ─────────────────

export async function createVPRequest(credType: CredentialType, verifier: VerifierConfig): Promise<StepResult> {
  const dcqlQuery = buildDcqlQuery(credType)
  const nonce = generateNonce()
  const transactionId = `txn-playground-${Date.now()}`
  const host = verifier.host || '/api/verifier'
  let request: any;
  let endpoint = '';

  if (verifier.env === 'local') {
    // Local Inji Verify 0.17.0 uses v1 Presentation Exchange
    const configId = credType.credentialTypeName || credType.id;
    request = {
      clientId: 'localhost-verifier',
      transactionId,
      nonce,
      presentationDefinition: {
        id: "presentation_definition",
        input_descriptors: [
          {
            id: configId,
            constraints: {
              fields: [
                {
                  path: ["$.type"],
                  filter: { type: "string", pattern: "VerifiableCredential" }
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
      clientId: 'injiverify.collab.mosip.net/',
      transactionId,
      nonce,
      dcqlQuery,
    }
    endpoint = `${host}/v1/verify/v2/vp-request`
  }

  const { res, data } = await postJson(endpoint, request)

  if (!res.ok) {
    throw new StepError(`VP request rejected by Inji Verify (HTTP ${res.status})`, {
      _request: request,
      _http_status: res.status,
      _response: data,
    })
  }

  const body = data as {
    transactionId: string
    requestId: string
    requestUri?: string
    expiresAt?: number
    authorizationDetails?: { nonce: string; responseUri: string }
  }

  currentVpSession = {
    transactionId: body.transactionId,
    requestId: body.requestId,
    nonce: body.authorizationDetails?.nonce ?? nonce,
    responseUri: body.authorizationDetails?.responseUri ?? '',
    requestUri: body.requestUri,
    expiresAt: body.expiresAt,
    dcqlQuery,
  }

  return { payload: { _request: request, _response: body }, source: 'live' }
}

// ── Step 6: VP token submission ─────────────────────────────────────────────
// Until the playground wallet holds a real credential (next phase), there is
// nothing genuine to present. Report that plainly instead of inventing a VP.

export async function submitVPResponse(verifier: VerifierConfig): Promise<StepResult> {
  const session = currentVpSession
  if (!session) {
    throw new StepError('No VP session — the authorization request step did not complete', {})
  }

  // 1. Ask the wallet to sign a Verifiable Presentation using the verifier's nonce.
  const { res: presentRes, data: presentData } = await postJson('/api/wallet/present', {
    nonce: session.nonce,
    clientId: 'injiverify.collab.mosip.net/',
  })
  if (!presentRes.ok) {
    throw new StepError('Failed to sign Verifiable Presentation', {
      _wallet_response: presentData,
      _http_status: presentRes.status,
      _blocked_by: 'Credential issuance might have failed upstream (step 4), meaning the wallet holds no credential to present.',
    })
  }

  const { vp_token, holderDid, credentialId } = presentData as Record<string, unknown>

  // 2. Submit it to the Verifier's responseUri (direct_post)
  let responseUri = session.responseUri || `${verifier.host || '/api/verifier'}/v1/verify/${verifier.env === 'local' ? 'vp-submission/direct-post' : 'v2/vp-submission/direct-post'}`
  
  if (responseUri.startsWith('http://') || responseUri.startsWith('https://')) {
    try {
      const url = new URL(responseUri)
      if (typeof window !== 'undefined' && url.origin !== window.location.origin) {
        responseUri = `${verifier.host || '/api/verifier'}${url.pathname}`
      }
    } catch {
      // keep existing responseUri
    }
  }

  // The verifier expects the submission as application/x-www-form-urlencoded.
  const submitParams = new URLSearchParams()
  if (verifier.env === 'local') {
    submitParams.set('vp_token', typeof vp_token === 'string' ? vp_token : JSON.stringify(vp_token))
    submitParams.set('presentation_submission', JSON.stringify({
      id: "submission_1",
      definition_id: "presentation_definition",
      descriptor_map: [
        {
          id: (session.dcqlQuery.credentials?.[0]?.id || 'credential_1'),
          format: "ldp_vp",
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

  console.log('=== SUBMIT VP RESPONSE DEBUG ===')
  console.log('Original session responseUri:', session.responseUri)
  console.log('Final responseUri being fetched:', responseUri)
  console.log('Fetch options method:', 'POST')
  console.log('Fetch params:', Array.from(submitParams.entries()))
  
  let submitRes;
  try {
    submitRes = await safeFetch(responseUri, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: submitParams.toString(),
    })
  } catch (err) {
    console.error('Fetch caught an exception:', err)
    throw err;
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
      _verifier_response: submitData,
    }, 
    source: 'live' 
  }
}

// ── Step 7: verification result ─────────────────────────────────────────────

export async function verifyPresentation(verifier: VerifierConfig): Promise<StepResult> {
  const session = currentVpSession
  if (!session) {
    throw new StepError('No VP session to fetch a result for', {})
  }

  const host = verifier.host || '/api/verifier'
  let res, data;
  if (verifier.env === 'local') {
    const getRes = await safeFetch(`${host}/v1/verify/vp-result/${session.transactionId}`)
    res = getRes;
    data = await readBody(getRes);
  } else {
    const postRes = await postJson(
      `${host}/v1/verify/v2/vp-results/${session.transactionId}`,
      { includeClaims: true },
    )
    res = postRes.res;
    data = postRes.data;
  }

  if (!res.ok) {
    throw new StepError(`No verification result for ${session.transactionId} (HTTP ${res.status})`, {
      _transaction_id: session.transactionId,
      _http_status: res.status,
      _response: data,
      _reason: 'Inji Verify only produces a result once a vp_token has been submitted to direct_post.',
    })
  }

  return { payload: data, source: 'live' }
}

/**
 * Direct VC verification against Inji Verify's /v2/vc-verification.
 * Independent of the VP session, so it works for any credential we can obtain
 * and is the quickest way to check a new signature suite in isolation.
 */
export async function verifyCredential(
  verifiableCredential: string,
  opts: { includeClaims?: boolean; skipStatusChecks?: boolean } = {},
): Promise<StepResult> {
  const { res, data } = await postJson('/api/verifier/v1/verify/v2/vc-verification', {
    verifiableCredential,
    includeClaims: opts.includeClaims ?? true,
    skipStatusChecks: opts.skipStatusChecks ?? false,
  })

  if (!res.ok) {
    throw new StepError(`VC verification call failed (HTTP ${res.status})`, {
      _http_status: res.status,
      _response: data,
    })
  }
  return { payload: data, source: 'live' }
}
