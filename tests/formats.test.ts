import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateEd25519Key, generateP256Key } from '../server/keys'
import { warmContextCache } from '../server/jsonld'
import { issueLdpCredential, verifyCredentialLocally } from '../server/formats/ldp'
import { issueSdJwtCredential, verifySdJwtLocally, createSdJwtPresentation } from '../server/formats/sd-jwt'
import { issueMdocCredential, verifyMdocLocally, createMdocPresentation } from '../server/formats/mdoc'

const SUBJECT = {
  fullName: 'Automated Test Resident',
  dateOfBirth: '1995-08-15',
  gender: 'Male',
  region: 'Karnataka',
}

describe('Cryptographic Formats: Issuance, Presentation and Local Verification', () => {
  it('should issue and locally verify W3C VC 1.1 JSON-LD credential', async () => {
    await warmContextCache()
    const issuerKey = await generateEd25519Key()

    const credential = await issueLdpCredential({
      key: issuerKey,
      dataModel: '1.1',
      credentialType: 'PlaygroundIdentityCredential',
      subject: SUBJECT,
      holderDid: issuerKey.did,
    })

    assert.ok(credential)
    assert.equal(credential.type[1], 'PlaygroundIdentityCredential')
    assert.equal(credential.issuer, issuerKey.did)
    assert.equal(credential.proof.type, 'Ed25519Signature2020')

    const verification = await verifyCredentialLocally(credential)
    assert.equal(verification.verified, true)
  })

  it('should issue and locally verify W3C VC 2.0 JSON-LD credential', async () => {
    await warmContextCache()
    const issuerKey = await generateEd25519Key()

    const credential = await issueLdpCredential({
      key: issuerKey,
      dataModel: '2.0',
      credentialType: 'PlaygroundIdentityCredential',
      subject: SUBJECT,
      holderDid: issuerKey.did,
    })

    assert.ok(credential)
    assert.equal(credential.type[1], 'PlaygroundIdentityCredential')
    assert.equal(credential.proof.type, 'Ed25519Signature2020')

    const verification = await verifyCredentialLocally(credential)
    assert.equal(verification.verified, true)
  })

  it('should issue and verify IETF SD-JWT VC with key binding and tamper detection', async () => {
    const issuerKey = await generateP256Key()
    const holderKey = await generateP256Key()

    // 1. Issue SD-JWT
    const issued = await issueSdJwtCredential({
      issuerKey,
      issuerUrl: 'http://localhost:3001/api/playground-issuer',
      vct: 'https://inji.mosip.io/credentials/farmer-identity',
      claims: {
        ...SUBJECT,
        farmerID: '2154189532',
      },
      holderKey,
    })

    assert.ok(issued.compact)
    assert.ok(issued.disclosures.length > 0)

    // 2. Local verification of issued credential
    const localVerify = await verifySdJwtLocally(issued.compact, {
      issuerPublicKey: issuerKey.publicJwk,
    })
    assert.equal(localVerify.verified, true)
    assert.equal(localVerify.claims.farmerID, '2154189532')

    // 3. Create Presentation with holder binding
    const nonce = 'test-challenge-nonce-123'
    const audience = 'https://injiverify.collab.mosip.net'
    const presentation = await createSdJwtPresentation({
      credential: issued.compact,
      holderKey,
      nonce,
      audience,
    })

    const vpVerify = await verifySdJwtLocally(presentation, {
      issuerPublicKey: issuerKey.publicJwk,
      expectedNonce: nonce,
      expectedAudience: audience,
    })
    assert.equal(vpVerify.verified, true)
    assert.equal(vpVerify.keyBindingVerified, true)

    // 4. Reject tampered signature
    const tamperedPresentation = presentation.slice(0, -10) + 'TAMPERED99'
    const tamperedVerify = await verifySdJwtLocally(tamperedPresentation, {
      issuerPublicKey: issuerKey.publicJwk,
      expectedNonce: nonce,
    })
    assert.equal(tamperedVerify.verified, false)
  })

  it('should issue and locally verify ISO/IEC 18013-5 mDoc', async () => {
    const issuerKey = await generateP256Key()
    const holderKey = await generateP256Key()

    const issued = await issueMdocCredential({
      issuerKey,
      issuerUrl: 'http://localhost:3001/api/playground-issuer',
      docType: 'org.iso.18013.5.1.mDL',
      claims: {
        family_name: 'Cooper',
        given_name: 'Gorge',
        birth_date: '1990-05-25',
        document_number: 'DL-5720110023456',
        issuing_country: 'IN',
      },
      holderKey,
    })

    assert.ok(issued.compact)
    assert.ok(issued.claims.document_number)

    // Local verification
    const localVerify = await verifyMdocLocally(issued.compact, {
      issuerPublicKey: issuerKey.publicJwk,
    })
    assert.equal(localVerify.verified, true)

    // Presentation creation
    const nonce = 'mdoc-test-nonce-456'
    const presentation = await createMdocPresentation({
      credential: issued.compact,
      holderKey,
      nonce,
      audience: 'https://injiverify.collab.mosip.net',
    })
    assert.ok(presentation)

    const vpVerify = await verifyMdocLocally(presentation, {
      issuerPublicKey: issuerKey.publicJwk,
    })
    assert.equal(vpVerify.verified, true)
  })
})
