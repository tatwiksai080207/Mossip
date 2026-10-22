import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  tamperProof,
  tamperVc,
  setTamperMode,
  getActiveTamperMode,
} from '../server/tamper'

describe('Deterministic Replay and Tamper Engine', () => {
  it('should get and set active tamper mode correctly', () => {
    setTamperMode('none')
    assert.equal(getActiveTamperMode(), 'none')

    setTamperMode('signature')
    assert.equal(getActiveTamperMode(), 'signature')

    setTamperMode('expired')
    assert.equal(getActiveTamperMode(), 'expired')

    // Reset back to none
    setTamperMode('none')
    assert.equal(getActiveTamperMode(), 'none')
  })

  it('should tamper proofValue for Ed25519 signature corruption', () => {
    const proof = {
      type: 'Ed25519Signature2020',
      proofValue: 'z2eQ9yV63wB8F5mK8R9jQ2aT4bV7cX0zP1eLmQk7V4Y3A2B1C6dE9fG2hJ5kL8mN1pQ4rS7tU0vW',
    }
    tamperProof(proof, 'signature')
    assert.ok(proof.proofValue.endsWith('TAMPERED99'))
    assert.notEqual(
      proof.proofValue,
      'z2eQ9yV63wB8F5mK8R9jQ2aT4bV7cX0zP1eLmQk7V4Y3A2B1C6dE9fG2hJ5kL8mN1pQ4rS7tU0vW'
    )
  })

  it('should tamper JWS signature in JWT proof object', () => {
    const proof = {
      type: 'JsonWebSignature2020',
      jws: 'eyJhbGciOiJFUzI1NiJ9..dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
    }
    tamperProof(proof, 'signature')
    assert.ok(proof.jws.endsWith('TAMPERED99'))
  })

  it('should corrupt compact JWT string signature portion', () => {
    const compactJwt = 'header.payload.validSignatureSegment123'
    const tampered = tamperVc(compactJwt, 'signature')
    assert.ok(typeof tampered === 'string')
    assert.ok(tampered.endsWith('TAMPERED99'))
  })

  it('should set past expiration date when mode is expired', () => {
    const vc = {
      id: 'urn:uuid:1234',
      type: ['VerifiableCredential'],
      issuanceDate: '2026-01-01T00:00:00Z',
      proof: { type: 'Ed25519Signature2020', proofValue: 'originalSig' },
    }
    const tampered = tamperVc(vc, 'expired')
    assert.equal(tampered.expirationDate, '2020-01-01T00:00:00Z')
    assert.equal(tampered.validUntil, '2020-01-01T00:00:00Z')
  })

  it('should return unchanged VC if mode is none', () => {
    const vc = {
      id: 'urn:uuid:1234',
      type: ['VerifiableCredential'],
      proof: { type: 'Ed25519Signature2020', proofValue: 'originalSig' },
    }
    const result = tamperVc(vc, 'none')
    assert.deepEqual(result, vc)
  })
})
