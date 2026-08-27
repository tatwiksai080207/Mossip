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

app.listen(PORT, () => {
  console.log(`[bff] Playground BFF running on http://localhost:${PORT}`)
  console.log(`[bff] Proxying to:`)
  console.log(`  Issuer:   ${ENDPOINTS.issuer}`)
  console.log(`  eSignet:  ${ENDPOINTS.esignet}`)
  console.log(`  Verifier: ${ENDPOINTS.verifier}`)
})
