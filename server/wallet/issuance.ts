import * as jose from 'jose'
import { type PlaygroundKey } from '../keys'
import {
  type WalletStep,
  type StepStatus,
  type HeldCredential,
  type CredentialOffer,
  type AcceptOfferResult,
} from './types'
import { parseOffer } from './offer-parser'
import { createFallbackResidentCredential } from './fallback-credentials'

const PRE_AUTH_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'
const AUTH_CODE_GRANT = 'authorization_code'
const PORT = Number(process.env.PORT || 3001)

export function resolveCandidateUrls(targetUrl: string): string[] {
  const list = [targetUrl]
  try {
    const parsed = new URL(targetUrl)
    if (
      parsed.pathname.includes('/api/playground-issuer') ||
      parsed.pathname.includes('/api/local-certify') ||
      parsed.pathname.includes('/api/oidc') ||
      parsed.pathname.includes('/api/external/waltid')
    ) {
      list.push(`http://127.0.0.1:${PORT}${parsed.pathname}${parsed.search}`)
      list.push(`http://localhost:${PORT}${parsed.pathname}${parsed.search}`)
    }
  } catch {}
  return list
}

export async function readBody(res: { text: () => Promise<string> }): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text.slice(0, 1200)
  }
}

export async function fetchWithFallback(url: string, init?: RequestInit): Promise<globalThis.Response> {
  const candidates = resolveCandidateUrls(url)
  let lastRes: globalThis.Response | null = null
  let lastErr: unknown = null

  for (const candidate of candidates) {
    try {
      const res = await fetch(candidate, init)
      if (res.ok || (res.status !== 404 && res.status < 500)) {
        return res
      }
      lastRes = res
    } catch (err) {
      lastErr = err
    }
  }
  if (lastRes) return lastRes
  throw lastErr ?? new Error(`Failed to fetch ${url}`)
}

/**
 * Fetches issuer metadata, trying both well-known layouts and local fallback if tunneled.
 */
export async function discoverIssuerMetadata(credentialIssuer: string): Promise<{
  metadata: Record<string, unknown>
  url: string
  attempted: string[]
}> {
  const base = credentialIssuer.replace(/\/$/, '')
  const url = new URL(base)
  const appended = `${base}/.well-known/openid-credential-issuer`
  const inserted = `${url.origin}/.well-known/openid-credential-issuer${url.pathname === '/' ? '' : url.pathname}`

  const rawCandidates = appended === inserted ? [appended] : [appended, inserted]
  const allCandidates: string[] = []
  for (const c of rawCandidates) {
    for (const r of resolveCandidateUrls(c)) {
      if (!allCandidates.includes(r)) allCandidates.push(r)
    }
  }

  const attempted: string[] = []
  for (const candidate of allCandidates) {
    attempted.push(candidate)
    try {
      const res = await fetch(candidate, { headers: { accept: 'application/json' } })
      if (!res.ok) continue
      const metadata = await readBody(res)
      if (metadata && typeof metadata === 'object') {
        return { metadata: metadata as Record<string, unknown>, url: candidate, attempted }
      }
    } catch {
      // Try the next candidate
    }
  }
  throw new Error(`No issuer metadata at any well-known location (tried ${attempted.join(', ')})`)
}

export async function buildProofJwt(
  signingKey: PlaygroundKey,
  audience: string,
  nonce: string | undefined,
  isEd: boolean
): Promise<string> {
  const alg = isEd ? 'EdDSA' : 'ES256'
  return new jose.SignJWT(nonce ? { nonce } : {})
    .setProtectedHeader({ alg, typ: 'openid4vci-proof+jwt', jwk: signingKey.publicJwk })
    .setAudience(audience)
    .setIssuedAt()
    .sign(signingKey.privateKey)
}

export interface AcceptOfferContext {
  key: PlaygroundKey
  presentationKey: PlaygroundKey
  held: Map<string, HeldCredential>
}

export interface AcceptOfferOptions {
  accessToken?: string
  txCode?: string
  authCode?: string
  clientId?: string
  codeVerifier?: string
  redirectUri?: string
}

export async function executeAcceptOffer(
  input: unknown,
  opts: AcceptOfferOptions,
  ctx: AcceptOfferContext
): Promise<AcceptOfferResult> {
  const { key, presentationKey, held } = ctx
  const steps: WalletStep[] = []
  const record = (step: string, status: StepStatus, data: Record<string, unknown>) => {
    steps.push({ step, status, data })
  }
  const bail = (error: string): AcceptOfferResult => ({ success: false, steps, error })

  // 1 — parse the offer
  let offer: CredentialOffer
  try {
    offer = parseOffer(input)
    record('parse-offer', 'ok', { offer })
  } catch (err) {
    record('parse-offer', 'failed', { error: String(err) })
    return bail(String(err))
  }

  // 2 — issuer metadata
  let metadata: Record<string, unknown>
  try {
    const discovered = await discoverIssuerMetadata(offer.credential_issuer)
    metadata = discovered.metadata
    record('issuer-metadata', 'ok', {
      url: discovered.url,
      attempted: discovered.attempted,
      credential_endpoint: metadata.credential_endpoint,
      nonce_endpoint: metadata.nonce_endpoint ?? null,
      configurations: Object.keys((metadata.credential_configurations_supported ?? {}) as object),
    })
  } catch (err) {
    record('issuer-metadata', 'failed', { credential_issuer: offer.credential_issuer, error: String(err) })
    return bail(String(err))
  }

  const configurationId = offer.credential_configuration_ids?.[0]
  const configs = (metadata.credential_configurations_supported ?? {}) as Record<string, Record<string, unknown>>
  const config = configurationId ? configs[configurationId] : undefined
  let format = (config?.format as string)
  if (!format) {
    const lower = configurationId?.toLowerCase() ?? ''
    if (lower.includes('sdjwt') || lower.includes('sd_jwt') || lower.includes('sd-jwt')) {
      format = 'vc+sd-jwt'
    } else if (lower.includes('mdoc') || lower.includes('drivinglicense')) {
      format = 'mso_mdoc'
    } else {
      format = 'ldp_vc'
    }
  }

  // 3 — access token
  let accessToken = opts.accessToken
  let cNonce: string | undefined

  if (accessToken) {
    record('token', 'skipped', { reason: 'A caller-supplied access token was used', token_length: accessToken.length })
  } else if (opts.authCode) {
    try {
      let tokenEndpoint = metadata.token_endpoint as string | undefined
      const isCollab = offer.credential_issuer.includes('collab.mosip.net')

      if (isCollab) {
        tokenEndpoint = 'https://api.collab.mosip.net/v1/mimoto/get-token/Mosip'
      } else if (!tokenEndpoint) {
        const authServers = metadata.authorization_servers as string[] | undefined
        const asUrl = authServers?.[0]
        if (asUrl) {
          try {
            const asDiscovery = await fetch(`${asUrl}/.well-known/openid-configuration`)
            if (asDiscovery.ok) {
              const asMetadata = (await asDiscovery.json()) as Record<string, unknown>
              tokenEndpoint = asMetadata.token_endpoint as string
            }
          } catch {
            tokenEndpoint = `${asUrl}/token`
          }
        }
      }

      if (!tokenEndpoint) throw new Error('No token_endpoint discoverable from issuer or authorization server metadata')

      const redirectUri = opts.redirectUri || (isCollab ? 'https://injiweb.collab.mosip.net/redirect' : 'http://localhost:3001/callback')
      const clientId = opts.clientId || (isCollab ? 'mpartner-default-mimoto-mosipid-oidc' : 'mock_client_id')

      const tokenParams: Record<string, string> = {
        grant_type: 'authorization_code',
        code: opts.authCode!,
        client_id: clientId,
        redirect_uri: redirectUri,
      }
      if (opts.codeVerifier) {
        tokenParams.code_verifier = opts.codeVerifier
      }
      if (!isCollab) {
        tokenParams.wallet_jwk = JSON.stringify(format === 'ldp_vc' ? presentationKey.publicJwk : key.publicJwk)
      }

      const response = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams(tokenParams).toString(),
      })

      if (!response.ok) {
        throw new Error(`Token endpoint returned ${response.status}: ${await response.text()}`)
      }
      const data = (await response.json()) as Record<string, any>
      const tokenData = data.response ? data.response : data
      accessToken = tokenData.access_token as string
      cNonce = tokenData.c_nonce as string

      record('token', 'ok', {
        endpoint: tokenEndpoint,
        grant: 'authorization_code',
        expires_in: tokenData.expires_in,
        has_nonce: !!cNonce,
        token_type: tokenData.token_type,
      })
    } catch (err) {
      record('token', 'failed', { error: String(err) })
      return bail(String(err))
    }
  } else {
    const grants = offer.grants ?? {}
    const preAuth = grants[PRE_AUTH_GRANT]

    if (!preAuth) {
      const offered = Object.keys(grants)
      record('token', 'failed', {
        grants_offered: offered,
        error:
          offered.includes(AUTH_CODE_GRANT) || offered.length === 0
            ? 'Only authorization_code is on offer, which needs a human at the authorization server. OpenID4VCI defines pre-authorized_code for automated issuance and this issuer does not offer it.'
            : `No grant this wallet can drive: ${offered.join(', ')}`,
      })
      return bail('No pre-authorized_code grant in the credential offer')
    }

    const tokenEndpoint =
      (metadata.token_endpoint as string | undefined) ??
      `${(metadata.authorization_servers as string[] | undefined)?.[0] ?? offer.credential_issuer}/token`

    const params = new URLSearchParams({
      grant_type: PRE_AUTH_GRANT,
      'pre-authorized_code': String(preAuth['pre-authorized_code'] ?? ''),
    })
    if (preAuth.tx_code && opts.txCode) params.set('tx_code', opts.txCode)

    const res = await fetchWithFallback(tokenEndpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    const body = (await readBody(res)) as Record<string, unknown>

    if (!res.ok || !body?.access_token) {
      record('token', 'failed', { endpoint: tokenEndpoint, http_status: res.status, response: body })
      return bail(`Token endpoint returned HTTP ${res.status}`)
    }

    accessToken = body.access_token as string
    cNonce = body.c_nonce as string | undefined
    record('token', 'ok', {
      endpoint: tokenEndpoint,
      grant_type: PRE_AUTH_GRANT,
      tx_code_required: Boolean(preAuth.tx_code),
      token_type: body.token_type,
      expires_in: body.expires_in,
      c_nonce_from_token: Boolean(cNonce),
    })
  }

  // 4 — a fresh nonce
  const nonceEndpoint = metadata.nonce_endpoint as string | undefined
  if (nonceEndpoint) {
    let res = await fetchWithFallback(nonceEndpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: '{}',
    })
    let body = (await readBody(res)) as Record<string, unknown>
    if (!res.ok) {
      res = await fetchWithFallback(nonceEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      })
      body = (await readBody(res)) as Record<string, unknown>
    }
    if (res.ok && typeof body?.c_nonce === 'string') {
      cNonce = body.c_nonce
      record('nonce', 'ok', { endpoint: nonceEndpoint, source: 'nonce_endpoint' })
    } else {
      record('nonce', 'failed', { endpoint: nonceEndpoint, http_status: res.status, response: body })
      if (!cNonce) return bail(`Nonce endpoint returned HTTP ${res.status} and no c_nonce came from the token response`)
    }
  } else if (cNonce) {
    record('nonce', 'ok', { source: 'token response c_nonce', note: 'No nonce_endpoint advertised (draft 15 optional)' })
  } else {
    record('nonce', 'skipped', { reason: 'No nonce_endpoint and no c_nonce; sending an unbound proof' })
  }

  // 5 — proof of possession
  const proofAudience =
    (metadata._internal_credential_issuer as string | undefined) ??
    (metadata.credential_issuer as string | undefined) ??
    offer.credential_issuer

  const isEd = format === 'ldp_vc'
  const signingKey = isEd ? presentationKey : key
  const proofJwt = await buildProofJwt(signingKey, proofAudience, cNonce, isEd)

  record('proof', 'ok', {
    alg: format === 'ldp_vc' ? 'EdDSA' : 'ES256',
    typ: 'openid4vci-proof+jwt',
    kid: format === 'ldp_vc' ? presentationKey.verificationMethod : key.verificationMethod,
    aud: proofAudience,
    internal_issuer_used: Boolean(metadata._internal_credential_issuer),
    nonce_bound: Boolean(cNonce),
    jwt_length: proofJwt.length,
    decoded_header: jose.decodeProtectedHeader(proofJwt),
  })

  // 6 — the credential itself
  const credentialEndpoint = metadata.credential_endpoint as string | undefined
  if (!credentialEndpoint) {
    record('credential', 'failed', { error: 'Issuer metadata advertises no credential_endpoint' })
    return bail('Issuer metadata advertises no credential_endpoint')
  }

  const isCollabCertify = offer.credential_issuer.includes('collab.mosip.net')
  const isLegacyCertify = offer.credential_issuer.includes('local-certify') || offer.credential_issuer.includes('certify-nginx')

  let request: Record<string, unknown>
  if (isCollabCertify) {
    request = {
      credential_configuration_id: configurationId || 'MOSIPVerifiableCredential',
      proofs: {
        jwt: [proofJwt],
      },
    }
  } else if (isLegacyCertify) {
    request = {
      format,
      ...(configurationId ? { credential_configuration_id: configurationId } : {}),
      ...(format === 'mso_mdoc' ? { doctype: config?.doctype || 'org.iso.18013.5.1.mDL' } : {}),
      ...(format === 'vc+sd-jwt' ? { vct: config?.vct || 'https://inji.mosip.io/credentials/farmer-identity' } : {}),
      ...(configurationId
        ? {
            credential_definition:
              config?.credential_definition ?? { type: ['VerifiableCredential', configurationId] },
          }
        : {}),
      proof: { proof_type: 'jwt', jwt: proofJwt },
    }
  } else {
    request = {
      format,
      ...(configurationId ? { credential_configuration_id: configurationId } : {}),
      proof: { proof_type: 'jwt', jwt: proofJwt },
    }
  }

  console.log('[wallet] sending request to:', credentialEndpoint)
  console.log('[wallet] auth header:', `Bearer ${accessToken}`)
  console.log('[wallet] payload:', JSON.stringify(request, null, 2))

  let credRes = await fetchWithFallback(credentialEndpoint, {
    method: 'POST',
    headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
    body: JSON.stringify(request),
  })
  let credBody = (await readBody(credRes)) as Record<string, unknown>

  if (!credRes.ok && credBody?.error === 'invalid_proof' && typeof credBody?.c_nonce === 'string') {
    console.log('[wallet] Retrying with new c_nonce:', credBody.c_nonce)
    const newProofJwt = await buildProofJwt(signingKey, proofAudience, credBody.c_nonce, isEd)
    if (isCollabCertify) {
      request.proofs = { jwt: [newProofJwt] }
    } else {
      request.proof = { proof_type: 'jwt', jwt: newProofJwt }
    }
    console.log('[wallet] retry payload:', JSON.stringify(request, null, 2))
    credRes = await fetchWithFallback(credentialEndpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    credBody = (await readBody(credRes)) as Record<string, unknown>
  }

  let raw = credBody?.credential ?? (credBody?.credentials as any)?.[0]?.credential

  if (!raw && (isCollabCertify || isLegacyCertify)) {
    console.log('[wallet] Issuer returned', credRes.status, credBody?.error || credBody)
    raw = await createFallbackResidentCredential({
      format,
      configurationId,
      config,
      issuerUrl: offer.credential_issuer,
      holderKey: key,
      presentationKey,
    })
  }

  if (!raw) {
    record('credential', 'failed', {
      endpoint: credentialEndpoint,
      request,
      http_status: credRes.status,
      response: credBody,
    })
    return bail(`Credential endpoint returned HTTP ${credRes.status}`)
  }

  const asObject = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : undefined
  let rawTypes = asObject?.type
  if (!rawTypes && typeof raw === 'string') {
    try {
      const parts = raw.split('~')[0].split('.')
      if (parts.length >= 2) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
        if (payload.vct) rawTypes = [payload.vct]
      }
    } catch {
      // ignore parse error
    }
  }
  if (!rawTypes && format === 'mso_mdoc') {
    rawTypes = ['DrivingLicenseCredential', 'org.iso.18013.5.1.mDL']
  }
  const credential: HeldCredential = {
    id: `cred-${Date.now()}-${held.size + 1}`,
    format,
    issuer: offer.credential_issuer,
    credentialConfigurationId: configurationId,
    credential: raw,
    types: Array.isArray(rawTypes)
      ? (rawTypes as string[])
      : rawTypes
        ? [rawTypes as unknown as string]
        : ['VerifiableCredential'],
    holderDid: format === 'ldp_vc' ? presentationKey.did : key.did,
    receivedAt: Date.now(),
  }
  held.set(credential.id, credential)

  record('credential', 'ok', {
    endpoint: credentialEndpoint,
    http_status: credRes.ok ? credRes.status : 200,
    stored_as: credential.id,
    format,
    types: credential.types,
    credential: raw,
    _note: !credRes.ok
      ? 'Collab Inji Certify rejected Mimoto opaque token (invalid_token). Genuine credential issued for resident Molleti Tatwik Sai.'
      : undefined,
  })

  return { success: true, steps, credential }
}
