/**
 * IETF SD-JWT VC (Selective Disclosure Verifiable Credentials) implementation
 * compliant with draft-ietf-oauth-sd-jwt-vc.
 *
 * Implements salted disclosures, issuer JWT signing, selective disclosure
 * filtering, holder Key Binding JWT (KB-JWT), and comprehensive cryptographic
 * verification.
 */

import crypto from 'crypto'
import * as jose from 'jose'
import type { PlaygroundKey } from '../keys'
import { resolveDid } from '../keys'

export interface IssueSdJwtOptions {
  issuerKey: PlaygroundKey
  issuerUrl: string
  vct: string
  claims: Record<string, unknown>
  holderKey?: PlaygroundKey
  holderDid?: string
  validityDays?: number
  expired?: boolean
  x5c?: string[]
}

export interface Disclosure {
  salt: string
  key: string
  value: unknown
  raw: string
  digest: string
}

export interface IssuedSdJwt {
  /** The full credential string: `<issuer_jwt>~<disclosure_1>~...~<disclosure_n>~` */
  compact: string
  issuerJwt: string
  disclosures: Disclosure[]
  claims: Record<string, unknown>
  vct: string
}

/**
 * Creates a salted disclosure: `base64url(JSON.stringify([salt, claimKey, claimValue]))`
 * and computes its sha-256 digest: `base64url(sha256(raw))`
 */
export function createDisclosure(key: string, value: unknown, customSalt?: string): Disclosure {
  const salt = customSalt || crypto.randomBytes(16).toString('base64url')
  const json = JSON.stringify([salt, key, value])
  const raw = Buffer.from(json, 'utf-8').toString('base64url')
  const digest = crypto.createHash('sha256').update(raw).digest('base64url')
  return { salt, key, value, raw, digest }
}

/**
 * Parses a raw disclosure string back into key and value.
 */
export function parseDisclosure(raw: string): { salt: string; key: string; value: unknown } | null {
  try {
    const json = Buffer.from(raw, 'base64url').toString('utf-8')
    const arr = JSON.parse(json)
    if (Array.isArray(arr) && arr.length === 3) {
      return { salt: String(arr[0]), key: String(arr[1]), value: arr[2] }
    }
  } catch {
    // Malformed disclosure
  }
  return null
}

/**
 * Issues an SD-JWT VC with selectively disclosable claims and holder key binding.
 */
export async function issueSdJwtCredential(opts: IssueSdJwtOptions): Promise<IssuedSdJwt> {
  const now = Math.floor(Date.now() / 1000)
  const validitySeconds = (opts.validityDays ?? 365) * 86400
  const iat = opts.expired ? now - validitySeconds - 3600 : now - 300
  const exp = opts.expired ? now - 3600 : now + validitySeconds

  // Create disclosures for each claim in opts.claims
  const disclosures: Disclosure[] = []
  for (const [k, v] of Object.entries(opts.claims)) {
    disclosures.push(createDisclosure(k, v))
  }

  const sdDigests = disclosures.map(d => d.digest).sort()

  const payload: Record<string, unknown> = {
    iss: opts.issuerUrl,
    iat,
    exp,
    vct: opts.vct,
    _sd_alg: 'sha-256',
    _sd: sdDigests,
  }

  // Key binding: bind to holder's JWK or DID in the cnf claim
  if (opts.holderKey?.publicJwk) {
    const raw = opts.holderKey.publicJwk as any
    if (raw.kty === 'EC') {
      payload.cnf = { jwk: { kty: 'EC', crv: raw.crv, x: raw.x, y: raw.y } }
    } else if (raw.kty === 'OKP') {
      payload.cnf = { jwk: { kty: 'OKP', crv: raw.crv, x: raw.x } }
    } else {
      payload.cnf = { jwk: raw }
    }
  } else if (opts.holderDid) {
    payload.cnf = { did: opts.holderDid }
  }

  const alg = opts.issuerKey.alg === 'EdDSA' ? 'EdDSA' : 'ES256'
  const certChain = opts.x5c || (opts.issuerKey as any).x5c
  const issuerJwt = await new jose.SignJWT(payload)
    .setProtectedHeader({
      alg,
      typ: 'vc+sd-jwt',
      kid: opts.issuerKey.verificationMethod || opts.issuerKey.did,
      ...(certChain ? { x5c: certChain } : {}),
    })
    .sign(opts.issuerKey.privateKey)

  // Combined format per spec: <issuer_jwt>~<d1>~<d2>~...~<dn>~
  const compact = `${issuerJwt}~${disclosures.map(d => d.raw).join('~')}~`

  return {
    compact,
    issuerJwt,
    disclosures,
    claims: opts.claims,
    vct: opts.vct,
  }
}

/**
 * Creates a presentation with optional Key Binding JWT (KB-JWT).
 */
export async function createSdJwtPresentation(opts: {
  credential: string
  holderKey: PlaygroundKey
  nonce?: string
  audience?: string
  discloseKeys?: string[]
}): Promise<string> {
  const parts = opts.credential.split('~')
  const issuerJwt = parts[0]
  const rawDisclosures = parts.slice(1).filter(p => p.length > 0)

  let selectedDisclosures = rawDisclosures
  if (opts.discloseKeys && opts.discloseKeys.length > 0) {
    const allowed = new Set(opts.discloseKeys)
    selectedDisclosures = rawDisclosures.filter(raw => {
      const parsed = parseDisclosure(raw)
      return parsed && allowed.has(parsed.key)
    })
  }

  const sdPayloadWithoutKb = `${issuerJwt}~${selectedDisclosures.join('~')}~`

  // Decode issuer JWT to check whether credential has holder key binding (cnf)
  let hasCnf = false
  try {
    const payload = JSON.parse(Buffer.from(issuerJwt.split('.')[1], 'base64url').toString('utf8'))
    hasCnf = Boolean(payload.cnf?.jwk || payload.cnf?.kid || payload.cnf?.did)
  } catch {}

  // If no nonce/audience requested, or credential does not contain a cnf claim, presentation is without KB-JWT
  if ((!opts.nonce && !opts.audience) || !hasCnf) {
    return sdPayloadWithoutKb
  }

  // Compute sd_hash over the presentation without the KB-JWT
  const sdHash = crypto.createHash('sha256').update(sdPayloadWithoutKb).digest('base64url')

  const kbPayload: Record<string, unknown> = {
    iat: Math.floor(Date.now() / 1000),
    sd_hash: sdHash,
  }
  if (opts.nonce) kbPayload.nonce = opts.nonce
  if (opts.audience) kbPayload.aud = opts.audience

  const kbAlg = opts.holderKey.alg === 'EdDSA' || (opts.holderKey.publicJwk as any)?.crv === 'Ed25519' ? 'EdDSA' : 'ES256'
  const kbJwt = await new jose.SignJWT(kbPayload)
    .setProtectedHeader({
      alg: kbAlg,
      typ: 'kb+jwt',
      kid: opts.holderKey.did,
    })
    .sign(opts.holderKey.privateKey)

  return `${sdPayloadWithoutKb}${kbJwt}`
}

export interface VerifySdJwtResult {
  verified: boolean
  error?: string
  claims: Record<string, unknown>
  vct?: string
  issuer?: string
  holderKey?: Record<string, unknown>
  keyBindingVerified?: boolean
}

/**
 * Cryptographically verifies an SD-JWT VC token with disclosures and optional KB-JWT.
 */
export async function verifySdJwtLocally(
  token: string,
  opts: {
    issuerPublicKey?: jose.CryptoKey | Record<string, unknown>
    expectedAudience?: string
    expectedNonce?: string
  } = {},
): Promise<VerifySdJwtResult> {
  try {
    const parts = token.split('~')
    if (parts.length < 2) {
      return { verified: false, error: 'Token is not a valid SD-JWT format (missing ~ separators)', claims: {} }
    }

    const issuerJwt = parts[0]
    const lastPart = parts[parts.length - 1]
    const hasKbJwt = lastPart.length > 0 && lastPart.split('.').length === 3
    const rawDisclosures = parts.slice(1, hasKbJwt ? parts.length - 1 : parts.length).filter(p => p.length > 0)

    // Decode issuer JWT claims and header
    const decodedIssuer = jose.decodeJwt(issuerJwt)
    const header = jose.decodeProtectedHeader(issuerJwt)

    // Cryptographically verify issuer signature over issuerJwt
    let issuerKey: any = null
    if (opts.issuerPublicKey) {
      issuerKey = (opts.issuerPublicKey instanceof CryptoKey)
        ? opts.issuerPublicKey
        : await jose.importJWK(opts.issuerPublicKey as jose.JWK, header.alg || 'ES256')
    } else if (header.kid && (header.kid.startsWith('did:key:') || header.kid.startsWith('did:jwk:'))) {
      const resolved = resolveDid(header.kid.split('#')[0])
      const alg = (resolved.publicJwk.alg as string) || (resolved.publicJwk.crv === 'Ed25519' ? 'EdDSA' : 'ES256')
      issuerKey = await jose.importJWK(resolved.publicJwk, alg)
    } else if (Array.isArray(header.x5c) && header.x5c.length > 0) {
      const leafCert = header.x5c[0]
      const pem = `-----BEGIN CERTIFICATE-----\n${leafCert.match(/.{1,64}/g)?.join('\n')}\n-----END CERTIFICATE-----`
      issuerKey = await jose.importX509(pem, header.alg || 'ES256')
    } else if (header.jwk) {
      issuerKey = await jose.importJWK(header.jwk as jose.JWK, header.alg || 'ES256')
    } else if (typeof decodedIssuer.iss === 'string' && (decodedIssuer.iss.startsWith('did:key:') || decodedIssuer.iss.startsWith('did:jwk:'))) {
      const resolved = resolveDid(decodedIssuer.iss.split('#')[0])
      const alg = (resolved.publicJwk.alg as string) || (resolved.publicJwk.crv === 'Ed25519' ? 'EdDSA' : 'ES256')
      issuerKey = await jose.importJWK(resolved.publicJwk, alg)
    }

    if (issuerKey) {
      try {
        await jose.jwtVerify(issuerJwt, issuerKey)
      } catch (jwtErr: any) {
        return {
          verified: false,
          error: `Cryptographic signature verification failed: ${jwtErr?.message || String(jwtErr)}`,
          claims: {},
        }
      }
    } else {
      return {
        verified: false,
        error: `Cannot verify SD-JWT: unable to resolve issuer public key from kid, x5c, jwk, or iss`,
        claims: {},
      }
    }

    // Check expiration
    const now = Math.floor(Date.now() / 1000)
    if (decodedIssuer.exp && decodedIssuer.exp < now) {
      return { verified: false, error: 'Credential has expired', claims: {} }
    }

    // Verify disclosures against _sd array
    const sdDigests = new Set(Array.isArray(decodedIssuer._sd) ? (decodedIssuer._sd as string[]) : [])
    const verifiedClaims: Record<string, unknown> = {}

    for (const raw of rawDisclosures) {
      const digest = crypto.createHash('sha256').update(raw).digest('base64url')
      if (!sdDigests.has(digest)) {
        return { verified: false, error: `Disclosure digest ${digest} not found in issuer _sd claim`, claims: {} }
      }
      const parsed = parseDisclosure(raw)
      if (parsed) {
        verifiedClaims[parsed.key] = parsed.value
      }
    }

    // Verify KB-JWT if present
    let keyBindingVerified = false
    if (hasKbJwt) {
      const kbJwt = lastPart
      const cnf = decodedIssuer.cnf as { jwk?: jose.JWK; kid?: string; did?: string } | undefined
      if (!cnf?.jwk && !cnf?.kid && !cnf?.did) {
        return { verified: false, error: 'KB-JWT present but no cnf in credential', claims: {} }
      }

      let holderKey: any
      if (cnf.jwk) {
        const alg = (cnf.jwk.alg as string) || (cnf.jwk.crv === 'Ed25519' ? 'EdDSA' : 'ES256')
        holderKey = await jose.importJWK(cnf.jwk, alg)
      } else {
        const targetDid = cnf.kid || cnf.did || ''
        if (targetDid.startsWith('did:key:') || targetDid.startsWith('did:jwk:')) {
          const resolved = resolveDid(targetDid)
          const alg = (resolved.publicJwk.alg as string) || (resolved.publicJwk.crv === 'Ed25519' ? 'EdDSA' : 'ES256')
          holderKey = await jose.importJWK(resolved.publicJwk, alg)
        } else {
          return { verified: false, error: `Unsupported cnf identifier in credential: ${targetDid}`, claims: {} }
        }
      }

      const { payload: kbPayload } = await jose.jwtVerify(kbJwt, holderKey)

      // Verify sd_hash
      const presentedWithoutKb = parts.slice(0, parts.length - 1).join('~') + '~'
      const expectedSdHash = crypto.createHash('sha256').update(presentedWithoutKb).digest('base64url')
      if (kbPayload.sd_hash !== expectedSdHash) {
        return { verified: false, error: `KB-JWT sd_hash mismatch: expected ${expectedSdHash}, got ${kbPayload.sd_hash}`, claims: {} }
      }

      if (opts.expectedNonce && kbPayload.nonce !== opts.expectedNonce) {
        return { verified: false, error: `KB-JWT nonce mismatch`, claims: {} }
      }
      if (opts.expectedAudience && kbPayload.aud !== opts.expectedAudience) {
        return { verified: false, error: `KB-JWT audience mismatch`, claims: {} }
      }
      keyBindingVerified = true
    }

    return {
      verified: true,
      claims: verifiedClaims,
      vct: decodedIssuer.vct as string,
      issuer: decodedIssuer.iss as string,
      holderKey: (decodedIssuer.cnf as any)?.jwk,
      keyBindingVerified,
    }
  } catch (err) {
    return { verified: false, error: String(err), claims: {} }
  }
}
