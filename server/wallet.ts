/**
 * The playground's holder wallet.
 *
 * Deliberately written against the specs rather than against our own issuer: it
 * discovers metadata, picks a grant from what the issuer actually advertises, and
 * fails with a specific reason when the issuer offers nothing it can drive
 * headlessly. That is what makes it useful as an interoperability probe — pointed
 * at Inji Certify it produces the same step log as when pointed at our issuer,
 * so the two are directly comparable.
 *
 * Every step is recorded, because the protocol inspector in the UI is a
 * deliverable in its own right and reconstructing the trace afterwards from
 * responses alone loses the requests.
 */

import { Router, type Request, type Response } from 'express'
import * as jose from 'jose'
import { generateEd25519Key, type PlaygroundKey } from './keys'
import { signPresentation } from './formats/ldp'

const PRE_AUTH_GRANT = 'urn:ietf:params:oauth:grant-type:pre-authorized_code'
const AUTH_CODE_GRANT = 'authorization_code'

export type StepStatus = 'ok' | 'failed' | 'skipped'

export interface WalletStep {
  step: string
  status: StepStatus
  /** Everything the inspector needs to show what actually went over the wire. */
  data: Record<string, unknown>
}

export interface HeldCredential {
  id: string
  format: string
  /** Credential Issuer Identifier it came from. */
  issuer: string
  credentialConfigurationId?: string
  /** Object for `ldp_vc`; a compact string for JWT-based formats. */
  credential: unknown
  types?: string[]
  holderDid: string
  receivedAt: number
}

export interface CredentialOffer {
  credential_issuer: string
  credential_configuration_ids: string[]
  grants?: Record<string, Record<string, unknown>>
}

/** Accepts an offer object, a `credential_offer=` deep link, or a JSON string. */
export function parseOffer(input: unknown): CredentialOffer {
  if (input && typeof input === 'object') return input as CredentialOffer

  if (typeof input === 'string') {
    const trimmed = input.trim()
    if (trimmed.startsWith('{')) return JSON.parse(trimmed)

    // openid-credential-offer://?credential_offer=<urlencoded json>
    const query = trimmed.includes('?') ? trimmed.slice(trimmed.indexOf('?') + 1) : trimmed
    const params = new URLSearchParams(query)
    const inline = params.get('credential_offer')
    if (inline) return JSON.parse(inline)
    throw new Error('Offer deep link carries no credential_offer parameter (credential_offer_uri is not supported yet)')
  }

  throw new Error('Unrecognised credential offer input')
}

// Structurally typed rather than annotated as `Response`, which in this file
// refers to Express's response object.
async function readBody(res: { text: () => Promise<string> }): Promise<unknown> {
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text.slice(0, 1200) }
}

/**
 * Fetches issuer metadata, trying both well-known layouts.
 *
 * OpenID4VCI specifies inserting `/.well-known/openid-credential-issuer` between
 * the host and the path of the issuer identifier; most deployments append it
 * instead. A wallet that only implements one of the two silently fails against
 * half the ecosystem, so this tries both and records which one answered.
 */
async function discoverIssuerMetadata(credentialIssuer: string): Promise<{
  metadata: Record<string, unknown>
  url: string
  attempted: string[]
}> {
  const base = credentialIssuer.replace(/\/$/, '')
  const url = new URL(base)
  const appended = `${base}/.well-known/openid-credential-issuer`
  const inserted = `${url.origin}/.well-known/openid-credential-issuer${url.pathname === '/' ? '' : url.pathname}`

  const attempted: string[] = []
  for (const candidate of appended === inserted ? [appended] : [appended, inserted]) {
    attempted.push(candidate)
    try {
      const res = await fetch(candidate, { headers: { accept: 'application/json' } })
      if (!res.ok) continue
      const metadata = await readBody(res)
      if (metadata && typeof metadata === 'object') {
        return { metadata: metadata as Record<string, unknown>, url: candidate, attempted }
      }
    } catch {
      // Try the next layout.
    }
  }
  throw new Error(`No issuer metadata at any well-known location (tried ${attempted.join(', ')})`)
}

export interface AcceptOfferResult {
  success: boolean
  steps: WalletStep[]
  credential?: HeldCredential
  error?: string
}

export interface Wallet {
  router: Router
  key: PlaygroundKey
  credentials: () => HeldCredential[]
  acceptOffer: (input: unknown, opts?: { accessToken?: string; txCode?: string }) => Promise<AcceptOfferResult>
}

export async function createWallet(): Promise<Wallet> {
  // One holder identity per process. did:key, because that is the method the
  // Collab Inji Verify deployment resolves without a network fetch.
  const key = await generateEd25519Key()
  const held = new Map<string, HeldCredential>()

  async function buildProofJwt(audience: string, nonce: string | undefined): Promise<string> {
    return new jose.SignJWT(nonce ? { nonce } : {})
      .setProtectedHeader({ alg: 'EdDSA', typ: 'openid4vci-proof+jwt', kid: key.verificationMethod })
      .setAudience(audience)
      .setIssuedAt()
      .sign(key.privateKey)
  }

  async function acceptOffer(
    input: unknown,
    opts: { accessToken?: string; txCode?: string } = {},
  ): Promise<AcceptOfferResult> {
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
    const format = (config?.format as string) ?? 'ldp_vc'

    // 3 — access token. Only the pre-authorized_code grant can run without a
    // browser; anything else is reported as the blocker it is.
    let accessToken = opts.accessToken
    let cNonce: string | undefined

    if (accessToken) {
      record('token', 'skipped', { reason: 'A caller-supplied access token was used', token_length: accessToken.length })
    } else {
      const grants = offer.grants ?? {}
      const preAuth = grants[PRE_AUTH_GRANT]

      if (!preAuth) {
        const offered = Object.keys(grants)
        record('token', 'failed', {
          grants_offered: offered,
          error: offered.includes(AUTH_CODE_GRANT) || offered.length === 0
            ? 'Only authorization_code is on offer, which needs a human at the authorization server. OpenID4VCI defines pre-authorized_code for automated issuance and this issuer does not offer it.'
            : `No grant this wallet can drive: ${offered.join(', ')}`,
        })
        return bail('No pre-authorized_code grant in the credential offer')
      }

      const tokenEndpoint = (metadata.token_endpoint as string | undefined)
        ?? `${(metadata.authorization_servers as string[] | undefined)?.[0] ?? offer.credential_issuer}/token`

      const params = new URLSearchParams({
        grant_type: PRE_AUTH_GRANT,
        'pre-authorized_code': String(preAuth['pre-authorized_code'] ?? ''),
      })
      // tx_code is a user-supplied transaction code; send it only when asked for.
      if (preAuth.tx_code && opts.txCode) params.set('tx_code', opts.txCode)

      const res = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })
      const body = await readBody(res) as Record<string, unknown>

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

    // 4 — a fresh nonce, preferring the dedicated endpoint when advertised
    const nonceEndpoint = metadata.nonce_endpoint as string | undefined
    if (nonceEndpoint) {
      const res = await fetch(nonceEndpoint, {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: '{}',
      })
      const body = await readBody(res) as Record<string, unknown>
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
    const credentialIssuer = (metadata.credential_issuer as string | undefined) ?? offer.credential_issuer
    const proofJwt = await buildProofJwt(credentialIssuer, cNonce)
    record('proof', 'ok', {
      alg: 'EdDSA',
      typ: 'openid4vci-proof+jwt',
      kid: key.verificationMethod,
      aud: credentialIssuer,
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

    const request: Record<string, unknown> = {
      format,
      credential_configuration_id: configurationId,
      proof: { proof_type: 'jwt', jwt: proofJwt },
    }
    const credRes = await fetch(credentialEndpoint, {
      method: 'POST',
      headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(request),
    })
    const credBody = await readBody(credRes) as Record<string, unknown>

    if (!credRes.ok || !credBody?.credential) {
      record('credential', 'failed', {
        endpoint: credentialEndpoint,
        request: { ...request, proof: { proof_type: 'jwt', jwt: `${proofJwt.slice(0, 32)}…` } },
        http_status: credRes.status,
        response: credBody,
      })
      return bail(`Credential endpoint returned HTTP ${credRes.status}`)
    }

    const raw = credBody.credential
    const asObject = typeof raw === 'object' && raw !== null ? raw as Record<string, unknown> : undefined
    const rawTypes = asObject?.type
    const credential: HeldCredential = {
      id: `cred-${Date.now()}-${held.size + 1}`,
      format,
      issuer: credentialIssuer,
      credentialConfigurationId: configurationId,
      credential: raw,
      types: Array.isArray(rawTypes) ? rawTypes as string[] : undefined,
      holderDid: key.did,
      receivedAt: Date.now(),
    }
    held.set(credential.id, credential)

    record('credential', 'ok', {
      endpoint: credentialEndpoint,
      http_status: credRes.status,
      stored_as: credential.id,
      format,
      types: credential.types,
      credential: raw,
    })

    return { success: true, steps, credential }
  }

  // ── HTTP surface ──────────────────────────────────────────────────────────
  const router = Router()

  router.get('/', (_req, res) => {
    res.json({ holder_did: key.did, verification_method: key.verificationMethod, count: held.size })
  })

  router.get('/credentials', (_req, res) => {
    res.json({ holderDid: key.did, credentials: [...held.values()] })
  })

  router.delete('/credentials', (_req, res) => {
    held.clear()
    res.json({ cleared: true })
  })

  router.post('/accept-offer', async (req: Request, res: Response) => {
    const { offer, offerUri, accessToken, txCode } = req.body ?? {}
    const result = await acceptOffer(offer ?? offerUri, { accessToken, txCode })
    res.status(result.success ? 200 : 400).json(result)
  })

  /**
   * Signs a Verifiable Presentation over a held credential, bound to the
   * verifier's nonce. `ldp_vp` only for now — the JWT and mDoc presentation
   * paths land with their credential formats.
   */
  router.post('/present', async (req: Request, res: Response) => {
    const { credentialId, nonce, clientId } = req.body ?? {}
    if (!nonce) {
      res.status(400).json({ error: 'A verifier nonce is required to bind the presentation' })
      return
    }

    const target = credentialId ? held.get(credentialId) : [...held.values()].at(-1)
    if (!target) {
      res.status(404).json({ error: 'No such credential in the wallet', available: [...held.keys()] })
      return
    }
    if (target.format !== 'ldp_vc') {
      res.status(400).json({ error: `Presenting ${target.format} is not implemented yet` })
      return
    }

    try {
      const vp = await signPresentation({
        credentials: [target.credential as Record<string, unknown>],
        holderKey: key,
        challenge: String(nonce),
        domain: clientId ? String(clientId) : undefined,
      })
      res.json({ vp_token: vp, holderDid: key.did, credentialId: target.id })
    } catch (err) {
      res.status(500).json({ error: 'Failed to sign the presentation', detail: String(err) })
    }
  })

  return { router, key, credentials: () => [...held.values()], acceptOffer }
}
