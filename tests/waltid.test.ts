import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import { createWaltIdIssuer } from '../server/external/waltid-issuer'
import { waltidVerifierRouter } from '../server/external/waltid'
import { warmContextCache } from '../server/jsonld'
import { verifySdJwtLocally, createSdJwtPresentation } from '../server/formats/sd-jwt'
import { generateP256Key } from '../server/keys'
import { buildProofJwt } from '../server/wallet/issuance'

describe('walt.id Suite: Genuine Cryptographic Issuer & Verifier Integrity', () => {
  let app: express.Express
  let server: any
  let baseUrl: string
  let issuerMount: string

  before(async () => {
    await warmContextCache()
    app = express()
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))

    issuerMount = '/api/external/waltid/issuer'
    const waltIdIssuer = await createWaltIdIssuer({ baseUrl: 'http://localhost:3001', mountPath: issuerMount })
    app.use(issuerMount, waltIdIssuer.router)
    app.get(`/.well-known/openid-credential-issuer${issuerMount}`, (req, res) => {
      res.json(waltIdIssuer.issuerMetadata(req))
    })
    app.get(`/.well-known/oauth-authorization-server${issuerMount}`, (req, res) => {
      res.json(waltIdIssuer.authorizationServerMetadata(req))
    })

    app.use('/api/external/waltid/verifier', waltidVerifierRouter)

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

  it('walt.id Issuer: should expose standards-compliant OpenID4VCI discovery metadata', async () => {
    const res = await fetch(`${baseUrl}/.well-known/openid-credential-issuer${issuerMount}`)
    assert.equal(res.status, 200)
    const meta = (await res.json()) as any
    assert.ok(meta.credential_issuer)
    assert.ok(meta.credential_endpoint)
    assert.ok(meta.credential_configurations_supported['waltid-identity-sdjwt'])
    assert.ok(meta.credential_configurations_supported['waltid-identity-ldp-vcdm11'])
    assert.ok(meta.credential_configurations_supported['waltid-identity-ldp-vcdm20'])
    assert.ok(meta.credential_configurations_supported['waltid-drivinglicense-mdoc'])
  })

  it('walt.id Issuer: should reject credential request when proof is missing', async () => {
    // 1. Create offer
    const offerRes = await fetch(`${baseUrl}${issuerMount}/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurationId: 'waltid-identity-sdjwt' }),
    })
    const offerData = (await offerRes.json()) as any
    const code = offerData.credential_offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']

    // 2. Token exchange
    const tokenRes = await fetch(`${baseUrl}${issuerMount}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': code,
      }),
    })
    const tokenData = (await tokenRes.json()) as any

    // 3. Request credential with missing proof
    const credRes = await fetch(`${baseUrl}${issuerMount}/credential`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        format: 'vc+sd-jwt',
        credential_configuration_id: 'waltid-identity-sdjwt',
      }),
    })
    assert.equal(credRes.status, 400)
    const credErr = (await credRes.json()) as any
    assert.equal(credErr.error, 'invalid_proof')
  })

  it('walt.id Issuer: should reject credential request with invalid c_nonce', async () => {
    // 1. Create offer
    const offerRes = await fetch(`${baseUrl}${issuerMount}/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurationId: 'waltid-identity-sdjwt' }),
    })
    const offerData = (await offerRes.json()) as any
    const code = offerData.credential_offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']

    // 2. Token exchange
    const tokenRes = await fetch(`${baseUrl}${issuerMount}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': code,
      }),
    })
    const tokenData = (await tokenRes.json()) as any

    // 3. Build proof with bad nonce
    const holderKey = await generateP256Key()
    const proofJwt = await buildProofJwt(
      holderKey,
      `${baseUrl}${issuerMount}`,
      'invalid-nonexistent-nonce',
      false,
    )

    // 4. Request credential
    const credRes = await fetch(`${baseUrl}${issuerMount}/credential`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        format: 'vc+sd-jwt',
        credential_configuration_id: 'waltid-identity-sdjwt',
        proof: { proof_type: 'jwt', jwt: proofJwt },
      }),
    })
    assert.equal(credRes.status, 400)
    const credErr = (await credRes.json()) as any
    assert.equal(credErr.error, 'invalid_proof')
    assert.ok(credErr.c_nonce, 'Issuer must return a fresh c_nonce on invalid_proof retry')
  })

  it('walt.id Issuer: should reject unauthenticated bearer tokens', async () => {
    const credRes = await fetch(`${baseUrl}${issuerMount}/credential`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer unauthenticated-fake-token-12345',
      },
      body: JSON.stringify({
        format: 'vc+sd-jwt',
        credential_configuration_id: 'waltid-identity-sdjwt',
      }),
    })
    assert.equal(credRes.status, 401)
  })

  it('walt.id Verifier: should cryptographically verify authentic SD-JWT VC and reject tampered signature', async () => {
    // 1. Issue authentic SD-JWT from walt.id issuer
    const offerRes = await fetch(`${baseUrl}${issuerMount}/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurationId: 'waltid-identity-sdjwt' }),
    })
    const offerData = (await offerRes.json()) as any
    const code = offerData.credential_offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']

    const tokenRes = await fetch(`${baseUrl}${issuerMount}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': code,
      }),
    })
    const tokenData = (await tokenRes.json()) as any

    const holderKey = await generateP256Key()
    const proofJwt = await buildProofJwt(
      holderKey,
      `${baseUrl}${issuerMount}`,
      tokenData.c_nonce,
      false,
    )

    const credRes = await fetch(`${baseUrl}${issuerMount}/credential`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        format: 'vc+sd-jwt',
        credential_configuration_id: 'waltid-identity-sdjwt',
        proof: { proof_type: 'jwt', jwt: proofJwt },
      }),
    })
    assert.equal(credRes.status, 200)
    const credData = (await credRes.json()) as any
    const sdJwtCredential = credData.credential

    // 2. Test authentic verification locally via verifySdJwtLocally with dynamic did:key resolution
    const localCheck = await verifySdJwtLocally(sdJwtCredential)
    assert.equal(localCheck.verified, true, `Local verification must succeed: ${localCheck.error}`)
    assert.ok(localCheck.claims.fullName, 'Should disclosably verify claims')

    // 3. Create OpenID4VP session on walt.id verifier
    const sessionRes = await fetch(`${baseUrl}/api/external/waltid/verifier/v1/verify/vp-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: 'txn-waltid-sdjwt-crypto-test' }),
    })
    assert.equal(sessionRes.status, 200)
    const sessionData = (await sessionRes.json()) as any
    const nonce = sessionData.authorizationDetails.nonce

    // 4. Create presentation with holder KB-JWT
    const vpPresentation = await createSdJwtPresentation({
      credential: sdJwtCredential,
      holderKey,
      nonce,
      audience: 'waltid-verifier',
    })

    // 5. Submit authentic presentation to direct_post
    const postRes = await fetch(`${baseUrl}/api/external/waltid/verifier/v1/verify/vp-submission/direct-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'txn-waltid-sdjwt-crypto-test',
        vp_token: vpPresentation,
      }),
    })
    assert.equal(postRes.status, 200)

    const resultRes = await fetch(`${baseUrl}/api/external/waltid/verifier/v1/verify/vp-result/txn-waltid-sdjwt-crypto-test`)
    assert.equal(resultRes.status, 200)
    const resultData = (await resultRes.json()) as any
    assert.equal(resultData.vpResultStatus, 'SUCCESS')
    assert.equal(resultData.checks.signatureValid, true)
    assert.equal(resultData.checks.keyBindingValid, true)

    // 6. NOW TEST TAMPERING: corrupt one character in the cryptographic signature segment
    // (Notice: no 'TAMPERED' or 'BAD_SIG' string used; pure cryptographic corruption)
    const parts = vpPresentation.split('~')
    const jwtParts = parts[0].split('.')
    // Flip a character in the base64 signature
    const corruptChar = jwtParts[2][5] === 'A' ? 'B' : 'A'
    jwtParts[2] = jwtParts[2].slice(0, 5) + corruptChar + jwtParts[2].slice(6)
    parts[0] = jwtParts.join('.')
    const tamperedVpToken = parts.join('~')

    // Create a new session for the tampered test
    await fetch(`${baseUrl}/api/external/waltid/verifier/v1/verify/vp-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transactionId: 'txn-waltid-sdjwt-tampered' }),
    })

    const postTamperedRes = await fetch(`${baseUrl}/api/external/waltid/verifier/v1/verify/vp-submission/direct-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'txn-waltid-sdjwt-tampered',
        vp_token: tamperedVpToken,
      }),
    })
    assert.equal(postTamperedRes.status, 200)

    const tamperedResultRes = await fetch(`${baseUrl}/api/external/waltid/verifier/v1/verify/vp-result/txn-waltid-sdjwt-tampered`)
    assert.equal(tamperedResultRes.status, 200)
    const tamperedResultData = (await tamperedResultRes.json()) as any
    assert.equal(tamperedResultData.vpResultStatus, 'FAILED')
    assert.equal(tamperedResultData.checks.signatureValid, false)
  })

  it('walt.id Verifier: should verify SD-JWT presentation satisfying DIF PEX descriptor constraint for https://walt.id/credentials/identity', async () => {
    // 1. Issue authentic SD-JWT from walt.id issuer
    const offerRes = await fetch(`${baseUrl}${issuerMount}/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ configurationId: 'waltid-identity-sdjwt' }),
    })
    const offerData = (await offerRes.json()) as any
    const code = offerData.credential_offer.grants['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']

    const tokenRes = await fetch(`${baseUrl}${issuerMount}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': code,
      }),
    })
    const tokenData = (await tokenRes.json()) as any

    const holderKey = await generateP256Key()
    const proofJwt = await buildProofJwt(
      holderKey,
      `${baseUrl}${issuerMount}`,
      tokenData.c_nonce,
      false,
    )

    const credRes = await fetch(`${baseUrl}${issuerMount}/credential`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenData.access_token}`,
      },
      body: JSON.stringify({
        format: 'vc+sd-jwt',
        credential_configuration_id: 'waltid-identity-sdjwt',
        proof: { proof_type: 'jwt', jwt: proofJwt },
      }),
    })
    assert.equal(credRes.status, 200)
    const credData = (await credRes.json()) as any
    const sdJwtCredential = credData.credential

    // 2. Create OpenID4VP request session on walt.id verifier WITH DIF PEX presentationDefinition
    const presentationDefinition = {
      id: 'waltid-identity-req',
      input_descriptors: [
        {
          id: 'identity_descriptor',
          format: { 'vc+sd-jwt': {} },
          constraints: {
            fields: [
              {
                path: ['$.vct'],
                filter: {
                  type: 'string',
                  pattern: 'https://walt.id/credentials/identity',
                },
              },
            ],
          },
        },
      ],
    }

    const sessionRes = await fetch(`${baseUrl}/api/external/waltid/verifier/v1/verify/vp-request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        transactionId: 'txn-waltid-sdjwt-pex-test',
        presentationDefinition,
      }),
    })
    assert.equal(sessionRes.status, 200)
    const sessionData = (await sessionRes.json()) as any
    const nonce = sessionData.authorizationDetails.nonce

    // 3. Create presentation
    const vpPresentation = await createSdJwtPresentation({
      credential: sdJwtCredential,
      holderKey,
      nonce,
      audience: 'waltid-verifier',
    })

    // 4. Submit presentation
    const postRes = await fetch(`${baseUrl}/api/external/waltid/verifier/v1/verify/vp-submission/direct-post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        state: 'txn-waltid-sdjwt-pex-test',
        vp_token: vpPresentation,
      }),
    })
    assert.equal(postRes.status, 200)

    // 5. Check outcome
    const resultRes = await fetch(`${baseUrl}/api/external/waltid/verifier/v1/verify/vp-result/txn-waltid-sdjwt-pex-test`)
    assert.equal(resultRes.status, 200)
    const resultData = (await resultRes.json()) as any

    assert.equal(resultData.vpResultStatus, 'SUCCESS')
    assert.equal(resultData.verificationStatus, 'SUCCESS')
    assert.equal(resultData.checks.signatureValid, true)
    assert.equal(resultData.checks.disclosuresValid, true)
    assert.equal(resultData.checks.keyBindingValid, true)
    assert.equal(resultData.checks.pexConstraintsValid, true)
    assert.equal(resultData.vcResults[0].vct, 'https://walt.id/credentials/identity')
  })
})
