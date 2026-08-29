import type { IssuerConfig, CredentialType } from './types'
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

async function runIssueFlow(issuer: IssuerConfig, credType: CredentialType): Promise<IssueFlowResponse> {
  const { data } = await postJson('/api/flow/issue', {
    credentialType: credType.credentialTypeName ?? credType.id,
    format: credType.format,
    issuerHost: issuer.host,
  })
  return data as IssueFlowResponse
}

let lastIssueFlow: IssueFlowResponse | null = null

export async function exchangeToken(
  issuer: IssuerConfig,
  credType: CredentialType,
): Promise<StepResult> {
  lastIssueFlow = await runIssueFlow(issuer, credType)
  const steps = lastIssueFlow.steps ?? []
  const find = (name: string) => steps.find(s => s.step === name)

  const nonce = find('nonce')
  const proof = find('proof')
  const keypair = find('keypair')

  if (!proof || proof.status !== 'ok') {
    throw new StepError('Failed to obtain a nonce and build a proof-of-possession', {
      _steps: steps.map(s => `${s.step}: ${s.status}`),
      _nonce: nonce?.data,
      _error: lastIssueFlow.error,
    })
  }

  return {
    payload: {
      _flow: 'OpenID4VCI — nonce-bound proof of possession',
      holder_did: keypair?.data?.holderDid,
      c_nonce: nonce?.data?.c_nonce,
      c_nonce_source: nonce?.status === 'ok' ? 'live (issuer nonce_endpoint)' : nonce?.status,
      proof_algorithm: 'EdDSA',
      proof_jwt_length: proof.data?.jwt_length,
      _note: 'An OAuth access token still has to come from the issuer\'s authorization server; see the next step.',
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
  const status = flow.httpStatus ?? 'unknown'

  throw new StepError(`Credential endpoint returned HTTP ${status}`, {
    _http_status: status,
    _issuer_response: credStep?.data,
    _steps: flow.steps?.map(s => `${s.step}: ${s.status}`),
    _gap: status === 403 || status === 401
      ? 'The Collab issuers accept only the authorization_code grant, so a bearer token from eSignet is required. OpenID4VCI also defines a pre-authorized_code grant for exactly this automated case, and it is not offered.'
      : `Unexpected status ${status} from the credential endpoint.`,
  })
}

// ── Step 5: VP authorization request (real OpenID4VP, DCQL) ─────────────────

export async function createVPRequest(credType: CredentialType): Promise<StepResult> {
  const dcqlQuery = buildDcqlQuery(credType)
  const nonce = generateNonce()
  const transactionId = `txn-playground-${Date.now()}`

  // clientId must match how the verifier identifies itself; the deployed Collab
  // verify-ui reports `injiverify.collab.mosip.net/` in its env.config.js.
  const request = {
    clientId: 'injiverify.collab.mosip.net/',
    transactionId,
    nonce,
    dcqlQuery,
  }

  const { res, data } = await postJson('/api/verifier/v1/verify/v2/vp-request', request)

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

export async function submitVPResponse(): Promise<StepResult> {
  const session = currentVpSession
  if (!session) {
    throw new StepError('No VP session — the authorization request step did not complete', {})
  }

  const statusRes = await safeFetch(
    `/api/verifier/v1/verify/vp-request/${session.requestId}/status`,
  )
  const status = await readBody(statusRes)

  throw new StepError('No credential is held, so no Verifiable Presentation can be signed', {
    _vp_session: session,
    _request_status: status,
    _request_status_http: statusRes.status,
    _blocked_by: 'Credential issuance failed upstream (step 4).',
    _next: 'A holder wallet that owns a real credential and signs the vp_token against this nonce is required to complete direct_post.',
  })
}

// ── Step 7: verification result ─────────────────────────────────────────────

export async function verifyPresentation(): Promise<StepResult> {
  const session = currentVpSession
  if (!session) {
    throw new StepError('No VP session to fetch a result for', {})
  }

  const { res, data } = await postJson(
    `/api/verifier/v1/verify/v2/vp-results/${session.transactionId}`,
    { includeClaims: true },
  )

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
