import type express from 'express'
import { broadcastNetworkEvent } from '../telemetry/websocket'

export interface ProxyResponse {
  status: number
  contentType: string
  headers: Headers
  body: any
}

/**
 * Express 5 wildcard helper: /*splat captures the remainder of the path.
 */
export function splatPath(req: express.Request): string {
  const splat = (req.params as Record<string, string[] | string>).splat
  return '/' + (Array.isArray(splat) ? splat.join('/') : splat || '')
}

/**
 * Forwards a request to a sandbox host and hands back status + parsed body.
 * Never throws on a non-2xx: callers decide what an error status means.
 */
export async function proxyRequest(
  targetBase: string,
  path: string,
  method: string,
  headers: Record<string, string>,
  body?: unknown,
): Promise<ProxyResponse> {
  const url = `${targetBase}${path}`

  const hopByHop = new Set(['host', 'connection', 'content-length', 'transfer-encoding'])
  const fetchHeaders: Record<string, string> = {}
  for (const [key, val] of Object.entries(headers)) {
    if (!hopByHop.has(key.toLowerCase()) && typeof val === 'string') {
      fetchHeaders[key] = val
    }
  }

  const options: RequestInit = { method, headers: fetchHeaders }
  console.log(`[proxyRequest] sending headers to ${url}:`, Object.keys(fetchHeaders))

  if (body && method !== 'GET' && method !== 'HEAD') {
    const contentType = fetchHeaders['content-type'] || ''
    if (contentType.includes('urlencoded')) {
      options.body = new URLSearchParams(body as Record<string, string>).toString()
    } else {
      options.body = JSON.stringify(body)
      if (!fetchHeaders['content-type']) fetchHeaders['content-type'] = 'application/json'
    }
  }

  const startTime = Date.now()
  const response = await fetch(url, options)
  const latencyMs = Date.now() - startTime
  const responseContentType = response.headers.get('content-type') || ''
  const isJson = responseContentType.includes('json')

  let bodyText = await response.text()
  let parsedBody: any = bodyText
  if (isJson && bodyText) {
    try {
      parsedBody = JSON.parse(bodyText)
    } catch {}
  }
  const payloadSize = (bodyText.length / 1024).toFixed(1) + 'KB'

  console.log(`[proxy] ${method} ${url} → ${response.status} (${latencyMs}ms, ${payloadSize})`)

  broadcastNetworkEvent({
    method,
    url,
    path,
    status: response.status,
    latencyMs,
    payloadSize,
  })

  return {
    status: response.status,
    contentType: responseContentType,
    headers: response.headers,
    body: parsedBody,
  }
}
