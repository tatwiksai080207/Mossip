import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'crypto'
import express from 'express'
import * as jose from 'jose'
import { oidcRouter, ensureKeys, FARMER_IDENTITIES, registerPreAuthCode } from '../server/oidc'

describe('Local OIDC Server: RFC 7636 PKCE & OpenID4VCI Compliance', () => {
  let app: express.Express
  let server: any
  let baseUrl: string

  before(async () => {
    await ensureKeys()
    app = express()
    app.use(express.json())
    app.use(express.urlencoded({ extended: true }))
    app.use('/api/oidc', oidcRouter)

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port
        baseUrl = `http://127.0.0.1:${port}/api/oidc`
        resolve()
      })
    })
  })

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('should expose OpenID Connect discovery metadata with PKCE and Draft 13 grants', async () => {
    const res = await fetch(`${baseUrl}/.well-known/openid-configuration`)
    assert.equal(res.status, 200)
    const meta = await res.json()
    assert.ok(meta.authorization_endpoint.includes('/authorize'))
    assert.ok(meta.token_endpoint.includes('/token'))
    assert.ok(meta.userinfo_endpoint.includes('/userinfo'))
    assert.deepEqual(meta.code_challenge_methods_supported, ['S256', 'plain'])
    assert.ok(meta.grant_types_supported.includes('authorization_code'))
    assert.ok(meta.grant_types_supported.includes('urn:ietf:params:oauth:grant-type:pre-authorized_code'))
  })

  it('should expose public JWKS containing an ES256 signing key', async () => {
    const res = await fetch(`${baseUrl}/jwks`)
    assert.equal(res.status, 200)
    const jwks = await res.json()
    assert.ok(Array.isArray(jwks.keys))
    assert.ok(jwks.keys.length > 0)
    assert.equal(jwks.keys[0].kty, 'EC')
    assert.equal(jwks.keys[0].crv, 'P-256')
    assert.equal(jwks.keys[0].alg, 'ES256')
  })

  it('should generate an authorization code via consent endpoint and complete token exchange with RFC 7636 PKCE S256', async () => {
    // 1. Generate PKCE verifier and S256 challenge
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

    // 2. Consent to authorization for James Rodrigious (8267411578)
    const consentRes = await fetch(`${baseUrl}/authorize/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state: 'xyz-state',
        sub: '8267411578',
      }),
    })
    assert.equal(consentRes.status, 200)
    const consentData = await consentRes.json()
    assert.ok(consentData.code)
    assert.ok(consentData.redirect_url.includes('code='))
    assert.ok(consentData.redirect_url.includes('state=xyz-state'))

    // 3. Exchange code for access token with valid PKCE code_verifier
    const tokenRes = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: consentData.code,
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        code_verifier: codeVerifier,
      }).toString(),
    })
    assert.equal(tokenRes.status, 200)
    const tokenData = await tokenRes.json()
    assert.ok(tokenData.access_token)
    assert.ok(tokenData.id_token)
    assert.ok(tokenData.c_nonce)
    assert.equal(tokenData.token_type, 'Bearer')

    // 4. Verify decoded access token claims match James Rodrigious
    const decoded = jose.decodeJwt(tokenData.access_token)
    assert.equal(decoded.sub, '8267411578')
    assert.equal(decoded.name, 'James Rodrigious')
  })

  it('should reject token exchange when PKCE code_verifier does not match challenge', async () => {
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

    const consentRes = await fetch(`${baseUrl}/authorize/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        sub: '2154189532',
      }),
    })
    const { code } = await consentRes.json()

    // Send invalid code_verifier
    const tokenRes = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        code_verifier: 'wrong-verifier-12345678901234567890',
      }).toString(),
    })
    assert.equal(tokenRes.status, 400)
    const err = await tokenRes.json()
    assert.equal(err.error, 'invalid_grant')
  })

  it('should enforce single-use authorization code (replay attack prevention)', async () => {
    const codeVerifier = crypto.randomBytes(32).toString('base64url')
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url')

    const consentRes = await fetch(`${baseUrl}/authorize/consent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        sub: '5860356276',
      }),
    })
    const { code } = await consentRes.json()

    // First exchange succeeds
    const res1 = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        code_verifier: codeVerifier,
      }).toString(),
    })
    assert.equal(res1.status, 200)

    // Second exchange with same code must fail
    const res2 = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: 'test-client',
        redirect_uri: 'http://localhost:3000/callback',
        code_verifier: codeVerifier,
      }).toString(),
    })
    assert.equal(res2.status, 400)
    const err = await res2.json()
    assert.equal(err.error, 'invalid_grant')
  })

  it('should exchange pre-authorized_code for access token bound to registered identity', async () => {
    const preAuthCode = 'preauth-test-' + crypto.randomBytes(8).toString('hex')
    registerPreAuthCode(preAuthCode, '5860356276') // Jane Thompson

    const res = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': preAuthCode,
      }).toString(),
    })
    assert.equal(res.status, 200)
    const data = await res.json()
    assert.ok(data.access_token)

    const decoded = jose.decodeJwt(data.access_token)
    assert.equal(decoded.sub, '5860356276')
    assert.equal(decoded.name, 'Jane Thompson')
  })

  it('should return demographic identity profile on /userinfo with Bearer token', async () => {
    // Mint token for Gorge Cooper
    const tokenRes = await fetch(`${baseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
        'pre-authorized_code': 'unregistered-code',
      }).toString(),
    })
    const { access_token } = await tokenRes.json()

    const userinfoRes = await fetch(`${baseUrl}/userinfo`, {
      headers: { Authorization: `Bearer ${access_token}` },
    })
    assert.equal(userinfoRes.status, 200)
    const profile = await userinfoRes.json()
    assert.equal(profile.sub, '2154189532')
    assert.equal(profile.name, 'Gorge Cooper')
    assert.equal(profile.address.region, 'Karnataka')
  })
})
