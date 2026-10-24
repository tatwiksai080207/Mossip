import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createSphereonIssuer } from '../server/external/sphereon-issuer'
import { sphereonVerifierRouter } from '../server/external/sphereon-verifier'
import { waltidVerifierRouter } from '../server/external/waltid'
import { createSphereonWallet } from '../server/external/sphereon-wallet'
import { warmContextCache } from '../server/jsonld'
import { verifySdJwtLocally } from '../server/formats/sd-jwt'
import { verifyCredentialLocally } from '../server/formats/ldp'
import { generateP256Key, generateEd25519Key } from '../server/keys'
import { buildProofJwt } from '../server/wallet/issuance'

describe('Sphereon Suite: Issuer, Verifier & Wallet Interoperability', () => {
  let app: express.Express
  let server: any
  let baseUrl: string

  before(async () => {
    await warmContextCache()
    app = express()
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))

    const issuerMount = '/api/external/sphereon/issuer'
    const sphereonIssuer = await createSphereonIssuer({ baseUrl: 'http://localhost:3001', mountPath: issuerMount })
    app.use(issuerMount, sphereonIssuer.router)
    app.get(`/.well-known/openid-credential-issuer${issuerMount}`, (req, res) => {
      res.json(sphereonIssuer.issuerMetadata(req))
    })
    app.get(`/.well-known/oauth-authorization-server${issuerMount}`, (req, res) => {
      res.json(sphereonIssuer.authorizationServerMetadata(req))
    })

    app.use('/api/external/sphereon/verifier', sphereonVerifierRouter)
    app.use('/api/external/waltid/verifier', waltidVerifierRouter)

    const sphereonWallet = await createSphereonWallet()
    app.use('/api/external/sphereon/wallet', sphereonWallet.router)

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port
        baseUrl = `http://127.0.0.1:${port}`
        resolve()
      })
    })
  })

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('Sphereon Issuer: should expose OpenID4VCI discovery metadata with EUDI PID and W3C VC 2.0', async () => {
    const res = await fetch(`${baseUrl}/.well-known/openid-credential-issuer/api/external/sphereon/issuer`)
    assert.equal(res.status, 200)
    const meta = await res.json()

    assert.ok(meta.credential_issuer)
    assert.ok(meta.credential_endpoint)
    assert.ok(meta.notification_endpoint)
    const configs = meta.credential_configurations_supported
    assert.ok(configs['sphereon-eudi-pid'])
    assert.equal(configs['sphereon-eudi-pid'].format, 'vc+sd-jwt')
    assert.ok(configs['sphereon-diploma-vcdm20'])
    assert.equal(configs['sphereon-diploma-vcdm20'].format, 'ldp_vc')
    assert.ok(configs['sphereon-ehic-vcdm11'])
  })

  it('Sphereon Issuer: should reject credential request when proof is missing', async () => {
    // 1. Get offer
    const offerRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurationId: 'sphereon-eudi-pid' }),
    })
    const offerData = await offerRes.json()
    const preAuthCode = offerData.credential_offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']

    // 2. Token exchange
    const tokenRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': preAuthCode,
      }),
    })
    const tokenData = await tokenRes.json()

    // 3. Request credential without proof -> should fail with 400 invalid_proof
    const credRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/credential`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        credential_configuration_id: 'sphereon-eudi-pid',
      }),
    })
    assert.equal(credRes.status, 400)
    const errData = await credRes.json()
    assert.equal(errData.error, 'invalid_proof')
  })

  it('Sphereon Issuer: should issue authentic European EUDI PID (SD-JWT VC) with cryptographic proof-of-possession', async () => {
    // 1. Get offer
    const offerRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurationId: 'sphereon-eudi-pid' }),
    })
    assert.equal(offerRes.status, 200)
    const offerData = await offerRes.json()
    const preAuthCode = offerData.credential_offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']
    assert.ok(preAuthCode)

    // 2. Token exchange
    const tokenRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': preAuthCode,
      }),
    })
    assert.equal(tokenRes.status, 200)
    const tokenData = await tokenRes.json()
    assert.ok(tokenData.access_token)
    assert.ok(tokenData.c_nonce)

    // 3. Real Holder Key and Proof-of-Possession JWT
    const holderKey = await generateP256Key()
    const proofJwt = await buildProofJwt(
      holderKey,
      `${baseUrl}/api/external/sphereon/issuer`,
      tokenData.c_nonce,
      false
    )

    // 4. Request credential with real proof
    const credRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/credential`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        credential_configuration_id: 'sphereon-eudi-pid',
        proof: { proof_type: 'jwt', jwt: proofJwt },
      }),
    })
    assert.equal(credRes.status, 200)
    const credData = await credRes.json()
    assert.ok(credData.credential)
    assert.ok(typeof credData.credential === 'string')
    assert.ok(credData.credential.includes('~')) // SD-JWT format

    // 5. Verify locally with real crypto
    const verified = await verifySdJwtLocally(credData.credential)
    assert.equal(verified.verified, true)
    assert.ok(verified.claims.family_name)
    assert.ok(verified.claims.given_name)
  })

  it('Sphereon Issuer: should issue authentic European Diploma (W3C VC 2.0 JSON-LD) with Ed25519Signature2020', async () => {
    // 1. Get offer
    const offerRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurationId: 'sphereon-diploma-vcdm20' }),
    })
    assert.equal(offerRes.status, 200)
    const offerData = await offerRes.json()
    const preAuthCode = offerData.credential_offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']

    // 2. Token exchange
    const tokenRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': preAuthCode,
      }),
    })
    assert.equal(tokenRes.status, 200)
    const tokenData = await tokenRes.json()

    // 3. Real Ed25519 Holder Key and Proof-of-Possession JWT
    const holderKey = await generateEd25519Key()
    const proofJwt = await buildProofJwt(
      holderKey,
      `${baseUrl}/api/external/sphereon/issuer`,
      tokenData.c_nonce,
      true
    )

    // 4. Request credential
    const credRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/credential`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        credential_configuration_id: 'sphereon-diploma-vcdm20',
        proof: { proof_type: 'jwt', jwt: proofJwt },
      }),
    })
    assert.equal(credRes.status, 200)
    const credData = await credRes.json()
    assert.ok(credData.credential)
    assert.equal(credData.credential.proof.type, 'Ed25519Signature2020')

    // 5. Verify locally with @digitalbazaar/vc
    const verification = await verifyCredentialLocally(credData.credential)
    assert.equal(verification.verified, true)
  })

  it('Sphereon Issuer: should acknowledge notification event receipt', async () => {
    const notifRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/notification`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        notification_id: 'notif-12345',
        event: 'credential_accepted',
      }),
    })
    assert.equal(notifRes.status, 204)
  })

  it('Sphereon Wallet: should accept credential offer, hold credential, and sign VP for verifier', async () => {
    // 1. Issue an offer from Sphereon Issuer
    const offerRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurationId: 'sphereon-eudi-pid' }),
    })
    const offerData = await offerRes.json()

    // 2. Wallet accepts offer with strictMode
    const acceptRes = await fetch(`${baseUrl}/api/external/sphereon/wallet/accept-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer: offerData.credential_offer }),
    })
    assert.equal(acceptRes.status, 200)
    const acceptData = await acceptRes.json()
    assert.equal(acceptData.success, true)

    // 3. Wallet creates presentation bound to verifier nonce
    const presentRes = await fetch(`${baseUrl}/api/external/sphereon/wallet/present`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nonce: 'sphereon-challenge-nonce-12345',
        clientId: 'sphereon-verifier',
      }),
    })
    assert.equal(presentRes.status, 200)
    const presentData = await presentRes.json()
    assert.ok(presentData.vp_token)
    assert.ok(presentData.holderDid)
    assert.equal(presentData.walletName, 'Sphereon Reference Wallet')
  })

  it('Sphereon Verifier: should verify authentic presentation and reject tampered or unknown state submissions', async () => {
    // 1. Create VP request
    const reqRes = await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nonce: 'test-verifier-nonce-8888',
        transactionId: 'txn-test-8888',
      }),
    })
    assert.equal(reqRes.status, 200)
    const reqData = await reqRes.json()
    assert.ok(reqData.requestId)

    // 2. Issue a real W3C VC 2.0 to Sphereon Wallet
    const offerRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurationId: 'sphereon-diploma-vcdm20' }),
    })
    const offerData = await offerRes.json()
    await fetch(`${baseUrl}/api/external/sphereon/wallet/accept-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer: offerData.credential_offer }),
    })

    // 3. Present valid VP
    const presentRes = await fetch(`${baseUrl}/api/external/sphereon/wallet/present`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nonce: 'test-verifier-nonce-8888',
        clientId: 'sphereon-verifier',
      }),
    })
    const presentData = await presentRes.json()

    // 4. Submit to direct-post
    const directPostRes = await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-submission/direct-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vp_token: presentData.vp_token,
        state: 'txn-test-8888',
      }),
    })
    assert.equal(directPostRes.status, 200)

    // Check result
    const statusRes = await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-result/txn-test-8888`)
    assert.equal(statusRes.status, 200)
    const statusData = await statusRes.json()
    assert.equal(statusData.verificationStatus, 'SUCCESS')
    assert.equal(statusData.vpResultStatus, 'SUCCESS')

    // 5. Test submission with unknown state -> strictly rejected with 400
    const unknownStateRes = await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-submission/direct-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vp_token: presentData.vp_token,
        state: 'unknown-expired-state',
      }),
    })
    assert.equal(unknownStateRes.status, 400)
    const unknownStateData = await unknownStateRes.json()
    assert.equal(unknownStateData.error, 'invalid_request')

    // 6. Test genuine cryptographic failure on tampered signature (no string cheating)
    const tamperedVpToken = JSON.parse(JSON.stringify(presentData.vp_token))
    if (tamperedVpToken.verifiableCredential) {
      const targetVc = Array.isArray(tamperedVpToken.verifiableCredential) ? tamperedVpToken.verifiableCredential[0] : tamperedVpToken.verifiableCredential
      if (targetVc?.proof?.proofValue) {
        // Corrupt signature bytes directly
        targetVc.proof.proofValue = targetVc.proof.proofValue.slice(0, -6) + '111111'
      }
    }

    // Submit to active session txn-test-8888
    await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-submission/direct-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vp_token: tamperedVpToken,
        state: 'txn-test-8888',
      }),
    })
    const tamperedStatusRes = await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-result/txn-test-8888`)
    const tamperedStatusData = await tamperedStatusRes.json()
    assert.equal(tamperedStatusData.verificationStatus, 'INVALID')
    assert.equal(tamperedStatusData.vpResultStatus, 'FAILED')
  })

  it('Sphereon Verifier: should verify presentations with DIF PEX input_descriptor constraints for Diploma & EHIC', async () => {
    // 1. Test Diploma with DIF PEX constraint (pattern: EuropeanHigherEducationDiploma)
    const reqRes = await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nonce: 'nonce-pex-diploma',
        transactionId: 'txn-pex-diploma',
        presentationDefinition: {
          id: 'diploma_presentation_definition',
          input_descriptors: [
            {
              id: 'sphereon-diploma-vcdm20',
              constraints: {
                fields: [
                  {
                    path: ['$.type[*]', '$.type'],
                    filter: {
                      type: 'string',
                      pattern: 'EuropeanHigherEducationDiploma',
                    },
                  },
                ],
              },
            },
          ],
        },
      }),
    })
    assert.equal(reqRes.status, 200)

    // Issue Diploma to wallet
    const offerRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurationId: 'sphereon-diploma-vcdm20' }),
    })
    const offerData = await offerRes.json()
    await fetch(`${baseUrl}/api/external/sphereon/wallet/accept-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer: offerData.credential_offer }),
    })

    // Present & Direct Post
    const presentRes = await fetch(`${baseUrl}/api/external/sphereon/wallet/present`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nonce: 'nonce-pex-diploma',
        clientId: 'sphereon-verifier',
      }),
    })
    const presentData = await presentRes.json()

    await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-submission/direct-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vp_token: presentData.vp_token,
        state: 'txn-pex-diploma',
      }),
    })

    const statusRes = await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-result/txn-pex-diploma`)
    const statusData = await statusRes.json()
    assert.equal(statusData.verificationStatus, 'SUCCESS')
    assert.equal(statusData.vpResultStatus, 'SUCCESS')
    assert.equal(statusData.checks.signatureValid, true)
    assert.equal(statusData.checks.pexConstraintsValid, true)

    // 2. Test EHIC with alias pattern (pattern: sphereon-ehic-vcdm11)
    const reqEhicRes = await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nonce: 'nonce-pex-ehic',
        transactionId: 'txn-pex-ehic',
        presentationDefinition: {
          id: 'ehic_presentation_definition',
          input_descriptors: [
            {
              id: 'sphereon-ehic-vcdm11',
              constraints: {
                fields: [
                  {
                    path: ['$.type[*]', '$.type'],
                    filter: {
                      type: 'string',
                      pattern: 'sphereon-ehic-vcdm11',
                    },
                  },
                ],
              },
            },
          ],
        },
      }),
    })
    assert.equal(reqEhicRes.status, 200)

    // Issue EHIC to wallet
    const offerEhicRes = await fetch(`${baseUrl}/api/external/sphereon/issuer/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurationId: 'sphereon-ehic-vcdm11' }),
    })
    const offerEhicData = await offerEhicRes.json()
    await fetch(`${baseUrl}/api/external/sphereon/wallet/accept-offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offer: offerEhicData.credential_offer }),
    })

    const presentEhicRes = await fetch(`${baseUrl}/api/external/sphereon/wallet/present`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nonce: 'nonce-pex-ehic',
        clientId: 'sphereon-verifier',
      }),
    })
    const presentEhicData = await presentEhicRes.json()

    await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-submission/direct-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vp_token: presentEhicData.vp_token,
        state: 'txn-pex-ehic',
      }),
    })

    const statusEhicRes = await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-result/txn-pex-ehic`)
    const statusEhicData = await statusEhicRes.json()
    assert.equal(statusEhicData.verificationStatus, 'SUCCESS')
    assert.equal(statusEhicData.vpResultStatus, 'SUCCESS')
    assert.equal(statusEhicData.checks.signatureValid, true)
    assert.equal(statusEhicData.checks.pexConstraintsValid, true)
  })

  it('walt.id Verifier: should reject mDoc presentation when DIF PEX descriptor requests LDP VC Diploma', async () => {
    // 1. Create VP request asking for LDP VC EuropeanHigherEducationDiploma
    const reqRes = await fetch(`${baseUrl}/api/external/waltid/verifier/v1/verify/vp-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nonce: 'nonce-waltid-pex-test',
        transactionId: 'txn-waltid-pex-mismatch',
        presentationDefinition: {
          id: 'diploma_presentation_definition',
          input_descriptors: [
            {
              id: 'sphereon-diploma-vcdm20',
              format: {
                ldp_vc: { proof_type: ['Ed25519Signature2020'] },
              },
              constraints: {
                fields: [
                  {
                    path: ['$.type[*]', '$.type'],
                    filter: {
                      type: 'string',
                      pattern: 'EuropeanHigherEducationDiploma',
                    },
                  },
                ],
              },
            },
          ],
        },
      }),
    })
    assert.equal(reqRes.status, 200)

    // 2. Issue a real ISO 18013-5 mDoc (Driving License)
    const { issueMdocCredential, createMdocPresentation } = await import('../server/formats/mdoc')
    const { generateP256Key } = await import('../server/keys')
    const holderKey = await generateP256Key()
    const mdoc = await issueMdocCredential({
      issuerKey: holderKey,
      issuerUrl: `${baseUrl}/api/playground-issuer`,
      docType: 'org.iso.18013.5.1.mDL',
      claims: {
        family_name: 'Tester',
        given_name: 'Driver',
        document_number: 'DL-TEST-99',
      },
      holderKey,
    })

    const mdocVp = await createMdocPresentation({
      credential: mdoc.compact,
      holderKey,
      nonce: 'nonce-waltid-pex-test',
    })

    // 3. Submit mDoc to walt.id Verifier
    await fetch(`${baseUrl}/api/external/waltid/verifier/v1/verify/vp-submission/direct-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vp_token: mdocVp,
        state: 'txn-waltid-pex-mismatch',
      }),
    })

    // 4. Verify walt.id Verifier properly rejects the mismatched credential!
    const statusRes = await fetch(`${baseUrl}/api/external/waltid/verifier/v1/verify/vp-result/txn-waltid-pex-mismatch`)
    assert.equal(statusRes.status, 200)
    const statusData = await statusRes.json()
    assert.equal(statusData.verificationStatus, 'INVALID')
    assert.equal(statusData.vpResultStatus, 'FAILED')
    assert.equal(statusData.checks.pexConstraintsValid, false)
    assert.ok(statusData.error.includes('fails DIF PEX descriptor constraint'))
  })

  it('Sphereon Verifier: should verify authentic EUDI PID SD-JWT VC presentation with holder KB-JWT', async () => {
    const { issueSdJwtCredential, createSdJwtPresentation } = await import('../server/formats/sd-jwt')
    const { generateP256Key, generateEd25519Key } = await import('../server/keys')

    const issuerKey = await generateEd25519Key()
    const holderKey = await generateP256Key()

    // 1. Issue an authentic EUDI PID with holder key binding in cnf.jwk
    const sdjwt = await issueSdJwtCredential({
      issuerKey,
      issuerUrl: `${baseUrl}/api/external/sphereon/issuer`,
      vct: 'https://credential-issuer.sphereon.com/credentials/eudi-pid',
      claims: {
        family_name: 'Dubois',
        given_name: 'Amélie',
        birth_date: '1995-06-14',
        gender: 'Female',
        nationality: 'FRA',
        issuing_country: 'FR',
        personal_administrative_number: 'FR-PID-950614-8842',
      },
      holderKey,
      holderDid: holderKey.did,
    })

    // 2. Request VP from Sphereon Verifier
    const reqRes = await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId: 'txn-sphereon-eudi-kbjwt',
        presentationDefinition: {
          id: 'eudi_pid_presentation',
          input_descriptors: [{
            id: 'eudi_pid_descriptor',
            format: { 'vc+sd-jwt': {} },
            constraints: {
              fields: [{
                path: ['$.vct'],
                filter: { type: 'string', pattern: 'sphereon-eudi-pid' },
              }],
            },
          }],
        },
      }),
    })
    const reqData = await reqRes.json()
    assert.equal(reqRes.status, 200)

    // 3. Holder creates presentation with KB-JWT
    const vpToken = await createSdJwtPresentation({
      credential: sdjwt.compact,
      holderKey,
      nonce: reqData.authorizationDetails.nonce,
      audience: 'sphereon-verifier',
    })

    // 4. Submit presentation to Sphereon Verifier
    const submitRes = await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-submission/direct-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vp_token: vpToken,
        state: 'txn-sphereon-eudi-kbjwt',
      }),
    })
    assert.equal(submitRes.status, 200)

    // 5. Check verification result - must be SUCCESS!
    const resultRes = await fetch(`${baseUrl}/api/external/sphereon/verifier/v1/verify/vp-result/txn-sphereon-eudi-kbjwt`)
    assert.equal(resultRes.status, 200)
    const result = await resultRes.json()
    assert.equal(result.vpResultStatus, 'SUCCESS')
    assert.equal(result.verificationStatus, 'SUCCESS')
    assert.equal(result.checks.signatureValid, true)
    assert.equal(result.checks.keyBindingValid, true)
    assert.equal(result.checks.pexConstraintsValid, true)
    assert.equal(result.vcResults[0].claims.family_name, 'Dubois')
  })
})

