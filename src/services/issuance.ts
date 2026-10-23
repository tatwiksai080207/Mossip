import type { IssuerConfig, CredentialType } from '../types'
import { safeFetch, readBody, postJson, StepError, type StepResult } from './http-client'
import { generatePkceVerifier, computePkceChallenge } from './crypto-pkce'

export async function fetchIssuerMetadata(issuer: IssuerConfig): Promise<StepResult> {
  const host = issuer.host ?? 'http://localhost:3001/api/local-certify'
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

export async function createCredentialOffer(
  issuer: IssuerConfig,
  credType: CredentialType,
): Promise<StepResult> {
  const host = issuer.host ?? 'http://localhost:3001/api/local-certify'
  const res = await safeFetch(`/api/wellknown?host=${encodeURIComponent(host)}`)
  const metadata = await readBody(res) as Record<string, unknown>

  if (!res.ok) {
    throw new StepError(`Cannot build a credential offer without issuer metadata (HTTP ${res.status})`, {
      _http_status: res.status,
      _response: metadata,
    })
  }

  const configId = (issuer.id === 'certify-playground' || issuer.id === 'issuer-waltid' || issuer.id === 'certify-local' || issuer.env === 'external')
    ? (credType.id ?? credType.credentialTypeName)
    : (credType.credentialTypeName ?? credType.id)

  if (issuer.id === 'certify-playground' || issuer.id === 'issuer-waltid' || issuer.id === 'certify-local' || issuer.env === 'external') {
    // Fetch a real offer from the issuer that includes a valid pre-authorized_code
    const offerEndpoint = issuer.id === 'issuer-waltid' || issuer.env === 'external'
      ? '/api/external/waltid/issuer/offer'
      : (issuer.id === 'certify-local' ? '/api/local-certify/offer' : '/api/playground-issuer/offer')
    let localGrantType: string | undefined = undefined
    try {
      // Dynamically read active grant preference for Local Inji Certify
      const { useStore } = await import('../store/index')
      localGrantType = useStore.getState().localGrantType
    } catch {}

    const offerRes = await postJson(offerEndpoint, {
      configurationId: configId,
      ...(issuer.id === 'certify-local' && localGrantType ? { grantType: localGrantType } : {}),
    })

    if (offerRes.res.ok) {
      const { credential_offer, credential_offer_uri } = offerRes.data as Record<string, any>
      return {
        payload: {
          ...credential_offer,
          _offer_uri: credential_offer_uri,
          _constructed_by: 'issuer',
          _reason: `Fetched from the ${issuer.name} /offer endpoint.`,
        },
        source: 'live',
      }
    }
  }

  const isInteractive = issuer.id === 'certify-collab-interactive' || issuer.env === 'collab'
  const preAuthCode = 'preauth-' + Math.random().toString(36).substring(2)
  const authServer = (metadata.authorization_servers as string[] | undefined)?.[0]

  const grants: Record<string, unknown> = {
    authorization_code: {
      authorization_server: authServer,
    },
  }

  if (!isInteractive) {
    grants['urn:ietf:params:oauth:grant-type:pre-authorized_code'] = {
      'pre-authorized_code': preAuthCode,
      ...(authServer ? { authorization_server: authServer } : {}),
    }
  }

  const offerPayload = {
    credential_issuer: metadata.credential_issuer,
    credential_configuration_ids: [configId],
    grants,
  }

  return {
    payload: {
      ...offerPayload,
      _constructed_by: 'playground',
      _reason: 'Issuer metadata advertises no credential_offer_endpoint (OpenID4VCI allows one).',
      _offer_uri: `openid-credential-offer://?credential_offer=${encodeURIComponent(
        JSON.stringify(offerPayload),
      )}`,
    },
    source: 'live',
  }
}

export interface IssueFlowResponse {
  success: boolean
  httpStatus?: number
  error?: string
  credential?: unknown
  steps?: { step: string; status: string; data: Record<string, unknown> }[]
}

let currentCodeVerifier: string | null = null

export async function runIssueFlow(issuer: IssuerConfig, credType: CredentialType, authCode?: string): Promise<IssueFlowResponse> {
  const offerStep = await createCredentialOffer(issuer, credType)
  const payload = offerStep.payload as Record<string, unknown>

  const offer = {
    credential_issuer: payload.credential_issuer,
    credential_configuration_ids: payload.credential_configuration_ids,
    grants: payload.grants as Record<string, unknown>,
  }

  const isCollab = issuer.id === 'certify-collab-interactive' || issuer.env === 'collab'

  if (!authCode) {
    const preAuth = offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']
    const authCodeGrant = offer.grants['authorization_code']

    if ((!preAuth && authCodeGrant) || (isCollab && !authCode)) {
      // Need manual intervention!
      const metadata = await fetchIssuerMetadata(issuer)
      const authServers = (metadata.payload as any).authorization_servers as string[] | undefined
      const authServerUrl = (authServers && authServers.length > 0)
        ? authServers[0]
        : (isCollab ? 'https://esignet-mosipid.collab.mosip.net' : 'http://localhost:3001/api/oidc')

      currentCodeVerifier = generatePkceVerifier()
      const codeChallenge = await computePkceChallenge(currentCodeVerifier)

      let authEndpoint = `${authServerUrl}/authorize`
      try {
        const asMetadataRes = await safeFetch(`${authServerUrl}/.well-known/openid-configuration`)
        if (asMetadataRes.ok) {
          const asMetadata = await readBody(asMetadataRes) as Record<string, any>
          if (asMetadata.authorization_endpoint) {
            authEndpoint = asMetadata.authorization_endpoint
          }
        }
      } catch {
        // Fallback to /authorize
      }

      const redirectUri = isCollab
        ? 'https://injiweb.collab.mosip.net/redirect'
        : 'http://localhost:3001/callback'

      const scope = 'openid'
      const clientId = issuer.clientId || (isCollab ? 'mpartner-default-mimoto-mosipid-oidc' : 'mock_client_id')

      const url = new URL(authEndpoint)
      url.searchParams.set('client_id', clientId)
      url.searchParams.set('response_type', 'code')
      url.searchParams.set('redirect_uri', redirectUri)
      url.searchParams.set('scope', scope)
      url.searchParams.set('code_challenge', codeChallenge)
      url.searchParams.set('code_challenge_method', 'S256')
      url.searchParams.set('state', `state-${Date.now()}`)

      const err = new Error('OAuthPauseRequired') as any
      err.oauthUrl = url.toString()
      throw err
    }
  }

  const clientId = issuer.clientId || (isCollab ? 'mpartner-default-mimoto-mosipid-oidc' : 'mock_client_id')
  const redirectUri = isCollab ? 'https://injiweb.collab.mosip.net/redirect' : 'http://localhost:3001/callback'
  const codeVerifier = currentCodeVerifier || undefined
  if (authCode) {
    currentCodeVerifier = null
  }

  const { data, res } = await postJson('/api/wallet/accept-offer', {
    offer,
    authCode,
    clientId,
    codeVerifier,
    redirectUri,
  })
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
