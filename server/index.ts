import express from 'express'
import cors from 'cors'

const app = express()
const PORT = 3001

// Collab sandbox endpoints
const ENDPOINTS = {
  issuer: 'https://injicertify-mock.collab.mosip.net',
  esignet: 'https://esignet.collab.mosip.net',
  esignetMock: 'https://esignet-mock.collab.mosip.net',
  verifier: 'https://api.collab.mosip.net',
}

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', endpoints: ENDPOINTS })
})

// Generic proxy helper
async function proxyRequest(
  targetBase: string,
  path: string,
  method: string,
  headers: Record<string, string>,
  body?: unknown,
) {
  const url = `${targetBase}${path}`
  console.log(`[proxy] ${method} ${url}`)

  const fetchHeaders: Record<string, string> = {}
  if (headers['content-type']) fetchHeaders['content-type'] = headers['content-type']
  if (headers['authorization']) fetchHeaders['authorization'] = headers['authorization']
  if (headers['accept']) fetchHeaders['accept'] = headers['accept']

  const options: RequestInit = { method, headers: fetchHeaders }

  if (body && method !== 'GET') {
    const contentType = fetchHeaders['content-type'] || ''
    if (contentType.includes('urlencoded')) {
      options.body = new URLSearchParams(body as Record<string, string>).toString()
    } else {
      options.body = JSON.stringify(body)
      if (!fetchHeaders['content-type']) {
        fetchHeaders['content-type'] = 'application/json'
      }
    }
  }

  const response = await fetch(url, options)
  const responseContentType = response.headers.get('content-type') || ''

  let responseBody: unknown
  if (responseContentType.includes('json')) {
    responseBody = await response.json()
  } else {
    responseBody = await response.text()
  }

  return { status: response.status, body: responseBody }
}

// Express v5 wildcard: /*splat captures everything after the prefix
app.all('/api/issuer/*splat', async (req, res) => {
  try {
    const splat = (req.params as Record<string, string[]>).splat
    const path = '/' + (Array.isArray(splat) ? splat.join('/') : splat || '')
    const result = await proxyRequest(
      ENDPOINTS.issuer, path, req.method,
      req.headers as Record<string, string>, req.body,
    )
    res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[proxy] issuer error:', err)
    res.status(502).json({ error: 'Failed to reach issuer', detail: String(err) })
  }
})

app.all('/api/esignet/*splat', async (req, res) => {
  try {
    const splat = (req.params as Record<string, string[]>).splat
    const path = '/' + (Array.isArray(splat) ? splat.join('/') : splat || '')
    const result = await proxyRequest(
      ENDPOINTS.esignet, path, req.method,
      req.headers as Record<string, string>, req.body,
    )
    res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[proxy] esignet error:', err)
    res.status(502).json({ error: 'Failed to reach eSignet', detail: String(err) })
  }
})

app.all('/api/verifier/*splat', async (req, res) => {
  try {
    const splat = (req.params as Record<string, string[]>).splat
    const path = '/' + (Array.isArray(splat) ? splat.join('/') : splat || '')
    const result = await proxyRequest(
      ENDPOINTS.verifier, path, req.method,
      req.headers as Record<string, string>, req.body,
    )
    res.status(result.status).json(result.body)
  } catch (err) {
    console.error('[proxy] verifier error:', err)
    res.status(502).json({ error: 'Failed to reach verifier', detail: String(err) })
  }
})

import * as jose from 'jose'

// ── Orchestrated issuance flow ──────────────────────────────────
// This endpoint performs the full OpenID4VCI credential issuance
// server-side: generate keypair → get nonce → build JWT proof → request credential
app.post('/api/flow/issue', async (req, res) => {
  const { credentialType = 'MockVerifiableCredential', format = 'ldp_vc' } = req.body || {}
  const steps: { step: string; status: string; data: unknown }[] = []

  try {
    // Step 1: Generate an Ed25519 keypair for the holder
    console.log('[flow] Generating holder keypair...')
    const { publicKey, privateKey } = await jose.generateKeyPair('EdDSA')
    const publicJwk = await jose.exportJWK(publicKey)
    const holderDid = `did:jwk:${Buffer.from(JSON.stringify(publicJwk)).toString('base64url')}`
    steps.push({ step: 'keypair', status: 'ok', data: { holderDid, algorithm: 'EdDSA' } })

    // Step 2: Fetch issuer metadata
    console.log('[flow] Fetching issuer metadata...')
    const metadataRes = await fetch(`${ENDPOINTS.issuer}/.well-known/openid-credential-issuer`)
    const metadata = await metadataRes.json() as Record<string, unknown>
    const credEndpoint = metadata.credential_endpoint as string
    const nonceEndpoint = metadata.nonce_endpoint as string
    steps.push({ step: 'metadata', status: 'ok', data: { credEndpoint, nonceEndpoint, credential_issuer: metadata.credential_issuer } })

    // Step 3: Get a c_nonce from the issuer
    console.log('[flow] Getting nonce...')
    const nonceRes = await fetch(nonceEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
    const nonceData = await nonceRes.json() as Record<string, unknown>
    const cNonce = nonceData.c_nonce as string
    steps.push({ step: 'nonce', status: 'ok', data: nonceData })

    // Step 4: Build a JWT proof-of-possession
    console.log('[flow] Building JWT proof...')
    const now = Math.floor(Date.now() / 1000)
    const proofJwt = await new jose.SignJWT({
      iss: holderDid,
      aud: metadata.credential_issuer as string,
      iat: now,
      nonce: cNonce,
    })
      .setProtectedHeader({
        alg: 'EdDSA',
        typ: 'openid4vci-proof+jwt',
        jwk: publicJwk,
      })
      .sign(privateKey)
    steps.push({ step: 'proof', status: 'ok', data: { jwt_length: proofJwt.length, iss: holderDid, nonce: cNonce } })

    // Step 5: Request the credential
    console.log('[flow] Requesting credential...')
    const credBody = {
      format,
      credential_definition: {
        type: ['VerifiableCredential', credentialType],
      },
      proof: {
        proof_type: 'jwt',
        jwt: proofJwt,
      },
    }

    const credRes = await fetch(credEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(credBody),
    })

    const credResponseBody = await credRes.json()
    steps.push({
      step: 'credential',
      status: credRes.ok ? 'ok' : `error_${credRes.status}`,
      data: credResponseBody,
    })

    console.log(`[flow] Credential response: ${credRes.status}`)
    res.json({
      success: credRes.ok,
      httpStatus: credRes.status,
      steps,
      credential: credRes.ok ? credResponseBody : null,
    })
  } catch (err) {
    console.error('[flow] issuance error:', err)
    res.status(500).json({
      success: false,
      error: String(err),
      steps,
    })
  }
})

app.listen(PORT, () => {
  console.log(`[bff] Playground BFF running on http://localhost:${PORT}`)
  console.log(`[bff] Proxying to:`)
  console.log(`  Issuer:   ${ENDPOINTS.issuer}`)
  console.log(`  eSignet:  ${ENDPOINTS.esignet}`)
  console.log(`  Verifier: ${ENDPOINTS.verifier}`)
})

