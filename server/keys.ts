/**
 * Key material for the playground's own issuer, holder wallet and verifier.
 *
 * Two representations of the same key are needed, which is why this module
 * exists rather than calling a library at each use site:
 *
 *   - `Ed25519VerificationKey2020` for the Digital Bazaar Data Integrity suite
 *     that signs `Ed25519Signature2020` proofs.
 *   - a `jose` CryptoKey for every JWT/JWS path (OpenID4VCI proof-of-possession,
 *     SD-JWT VC, signed authorization requests).
 *
 * Both are derived from a single seed so the `did:key` published in a credential
 * is genuinely the key that signed it.
 */

import * as jose from 'jose'
import { Ed25519VerificationKey2020 } from '@digitalbazaar/ed25519-verification-key-2020'

// ── base58btc ───────────────────────────────────────────────────────────────
// did:key and publicKeyMultibase are base58btc (`z` prefix). Implemented here
// to keep the multicodec handling for P-256 explicit and dependency-free.

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return ''
  const digits = [0]
  for (const byte of bytes) {
    let carry = byte
    for (let i = 0; i < digits.length; i++) {
      carry += digits[i] << 8
      digits[i] = carry % 58
      carry = (carry / 58) | 0
    }
    while (carry > 0) {
      digits.push(carry % 58)
      carry = (carry / 58) | 0
    }
  }
  // Leading zero bytes map to leading '1's.
  let out = ''
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out += B58[0]
  for (let i = digits.length - 1; i >= 0; i--) out += B58[digits[i]]
  return out
}

export function base58Decode(str: string): Uint8Array {
  if (str.length === 0) return new Uint8Array()
  const bytes = [0]
  for (const char of str) {
    const value = B58.indexOf(char)
    if (value < 0) throw new Error(`Invalid base58 character: ${char}`)
    let carry = value
    for (let i = 0; i < bytes.length; i++) {
      carry += bytes[i] * 58
      bytes[i] = carry & 0xff
      carry >>= 8
    }
    while (carry > 0) {
      bytes.push(carry & 0xff)
      carry >>= 8
    }
  }
  const leadingZeros: number[] = []
  for (let i = 0; i < str.length && str[i] === B58[0]; i++) leadingZeros.push(0)
  return new Uint8Array([...leadingZeros, ...bytes.reverse()])
}

/** Multicodec prefixes, varint-encoded, per the multicodec table. */
const MULTICODEC = {
  ed25519Pub: Uint8Array.from([0xed, 0x01]),
  ed25519Priv: Uint8Array.from([0x80, 0x26]),
  p256Pub: Uint8Array.from([0x80, 0x24]),
}

function multibase(prefix: Uint8Array, key: Uint8Array): string {
  return `z${base58Encode(new Uint8Array([...prefix, ...key]))}`
}

function stripMultibase(value: string, expectedPrefix: Uint8Array): Uint8Array {
  if (!value.startsWith('z')) throw new Error(`Expected base58btc multibase, got ${value.slice(0, 8)}`)
  const decoded = base58Decode(value.slice(1))
  for (let i = 0; i < expectedPrefix.length; i++) {
    if (decoded[i] !== expectedPrefix[i]) {
      throw new Error('Multicodec prefix mismatch for the requested key type')
    }
  }
  return decoded.subarray(expectedPrefix.length)
}

const b64u = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

// ── Key pairs ───────────────────────────────────────────────────────────────

export interface PlaygroundKey {
  /** JWS algorithm this key signs with. */
  alg: 'EdDSA' | 'ES256'
  /** `did:key:z…` — the method Inji Verify resolves without a network fetch. */
  did: string
  /** `did:jwk:…` — accepted by Inji Certify's credential endpoint. */
  didJwk: string
  /** Fully-qualified verification method, used as `proof.verificationMethod`. */
  verificationMethod: string
  publicKeyMultibase: string
  publicJwk: jose.JWK
  privateJwk: jose.JWK
  privateKey: jose.CryptoKey
  publicKey: jose.CryptoKey
  /** Present only for Ed25519; the Data Integrity suite needs it. */
  signatureKeyPair?: Ed25519VerificationKey2020
}

function didJwkFrom(publicJwk: jose.JWK): string {
  return `did:jwk:${Buffer.from(JSON.stringify(publicJwk)).toString('base64url')}`
}

/**
 * Ed25519 key for `Ed25519Signature2020` and EdDSA JWTs.
 *
 * The seed is taken from `Ed25519VerificationKey2020.generate()` rather than
 * generated separately, so the suite instance and the `jose` key are provably
 * the same key.
 */
export async function generateEd25519Key(): Promise<PlaygroundKey> {
  const signatureKeyPair = await Ed25519VerificationKey2020.generate()

  const publicKeyBytes = stripMultibase(signatureKeyPair.publicKeyMultibase, MULTICODEC.ed25519Pub)
  // The 2020 suite stores the 64-byte libsodium secret key: seed || publicKey.
  const secretKeyBytes = stripMultibase(signatureKeyPair.privateKeyMultibase, MULTICODEC.ed25519Priv)
  const seed = secretKeyBytes.subarray(0, 32)

  const publicJwk: jose.JWK = { kty: 'OKP', crv: 'Ed25519', x: b64u(publicKeyBytes) }
  const privateJwk: jose.JWK = { ...publicJwk, d: b64u(seed) }

  const did = `did:key:${signatureKeyPair.publicKeyMultibase}`
  // did:key controller and key id: the fragment repeats the multibase value.
  const verificationMethod = `${did}#${signatureKeyPair.publicKeyMultibase}`
  signatureKeyPair.controller = did
  signatureKeyPair.id = verificationMethod

  return {
    alg: 'EdDSA',
    did,
    didJwk: didJwkFrom(publicJwk),
    verificationMethod,
    publicKeyMultibase: signatureKeyPair.publicKeyMultibase,
    publicJwk,
    privateJwk,
    privateKey: await jose.importJWK(privateJwk, 'EdDSA') as jose.CryptoKey,
    publicKey: await jose.importJWK(publicJwk, 'EdDSA') as jose.CryptoKey,
    signatureKeyPair,
  }
}

/** P-256 key for SD-JWT VC and mDoc, both of which specify ES256. */
export async function generateP256Key(): Promise<PlaygroundKey> {
  const { publicKey, privateKey } = await jose.generateKeyPair('ES256', { extractable: true })
  const publicJwk = await jose.exportJWK(publicKey)
  const privateJwk = await jose.exportJWK(privateKey)

  // Compressed SEC1 point: 0x02/0x03 by y-parity, then x.
  const x = Buffer.from(publicJwk.x as string, 'base64url')
  const y = Buffer.from(publicJwk.y as string, 'base64url')
  const compressed = new Uint8Array([(y[y.length - 1] & 1) === 0 ? 0x02 : 0x03, ...x])
  const publicKeyMultibase = multibase(MULTICODEC.p256Pub, compressed)

  const did = `did:key:${publicKeyMultibase}`
  return {
    alg: 'ES256',
    did,
    didJwk: didJwkFrom(publicJwk),
    verificationMethod: `${did}#${publicKeyMultibase}`,
    publicKeyMultibase,
    publicJwk,
    privateJwk,
    privateKey,
    publicKey,
  }
}

/**
 * The `did:key` DID document, so the playground can serve a resolvable document
 * for wallets that fetch rather than decode. Inji Verify decodes, but Inji Web
 * has been observed to fetch.
 */
export function didKeyDocument(key: PlaygroundKey): Record<string, unknown> {
  const vm: Record<string, unknown> = {
    id: key.verificationMethod,
    type: key.alg === 'EdDSA' ? 'Ed25519VerificationKey2020' : 'JsonWebKey2020',
    controller: key.did,
  }
  if (key.alg === 'EdDSA') vm.publicKeyMultibase = key.publicKeyMultibase
  else vm.publicKeyJwk = key.publicJwk

  return {
    '@context': [
      'https://www.w3.org/ns/did/v1',
      key.alg === 'EdDSA'
        ? 'https://w3id.org/security/suites/ed25519-2020/v1'
        : 'https://w3id.org/security/suites/jws-2020/v1',
    ],
    id: key.did,
    verificationMethod: [vm],
    authentication: [key.verificationMethod],
    assertionMethod: [key.verificationMethod],
  }
}
