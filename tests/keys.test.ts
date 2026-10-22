import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateEd25519Key,
  generateP256Key,
  base58Encode,
  base58Decode,
  publicJwkFromDidKey,
  resolveDid,
} from '../server/keys'

describe('Cryptographic Keys and DID Resolution', () => {
  it('should encode and decode base58btc bytes losslessly', () => {
    const raw = new Uint8Array([0x00, 0x01, 0x23, 0x45, 0x67, 0x89, 0xab, 0xcd, 0xef])
    const encoded = base58Encode(raw)
    assert.ok(typeof encoded === 'string' && encoded.length > 0)
    const decoded = base58Decode(encoded)
    assert.deepEqual(decoded, raw)
  })

  it('should generate an Ed25519 keypair with valid did:key and verificationMethod', async () => {
    const key = await generateEd25519Key()
    assert.equal(key.alg, 'EdDSA')
    assert.equal(key.publicJwk.crv, 'Ed25519')
    assert.ok(key.did.startsWith('did:key:z6Mk'))
    assert.equal(key.verificationMethod, `${key.did}#${key.did.slice('did:key:'.length)}`)
    assert.ok(key.publicJwk.x)
    assert.equal(key.publicJwk.kty, 'OKP')
    assert.ok(key.signatureKeyPair)
  })

  it('should generate a P-256 keypair with valid did:key and JWK', async () => {
    const key = await generateP256Key()
    assert.equal(key.alg, 'ES256')
    assert.equal(key.publicJwk.crv, 'P-256')
    assert.ok(key.did.startsWith('did:key:zDna'))
    assert.equal(key.publicJwk.kty, 'EC')
    assert.ok(key.publicJwk.x)
    assert.ok(key.publicJwk.y)
  })

  it('should resolve did:key for Ed25519 correctly', async () => {
    const key = await generateEd25519Key()
    const resolved = resolveDid(key.did)
    assert.equal(resolved.did, key.did)
    assert.equal(resolved.alg, 'EdDSA')
    assert.equal(resolved.publicJwk.crv, 'Ed25519')
    assert.equal(resolved.publicJwk.x, key.publicJwk.x)
  })

  it('should resolve did:key for P-256 correctly', async () => {
    const key = await generateP256Key()
    const resolved = resolveDid(key.did)
    assert.equal(resolved.did, key.did)
    assert.equal(resolved.alg, 'ES256')
    assert.equal(resolved.publicJwk.crv, 'P-256')
    assert.equal(resolved.publicJwk.x, key.publicJwk.x)
    assert.equal(resolved.publicJwk.y, key.publicJwk.y)
  })

  it('should extract JWK using publicJwkFromDidKey', async () => {
    const key = await generateEd25519Key()
    const extracted = publicJwkFromDidKey(key.did)
    assert.equal(extracted.alg, 'EdDSA')
    assert.equal(extracted.publicJwk.crv, 'Ed25519')
    assert.equal(extracted.publicJwk.x, key.publicJwk.x)
  })

  it('should throw an error on invalid or unsupported DID methods', () => {
    assert.throws(() => resolveDid('did:unknown:12345'), /Unsupported DID method/)
  })
})
