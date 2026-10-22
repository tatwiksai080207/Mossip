import type { DcqlQuery } from './dcql'

export interface StepResult {
  payload: unknown
  source: 'live' | 'mock'
  error?: string
}

/** Thrown so the store can render a failed step with full diagnostics attached. */
export class StepError extends Error {
  stepPayload: unknown
  constructor(message: string, stepPayload: unknown) {
    super(message)
    this.name = 'StepError'
    this.stepPayload = stepPayload
  }
}

export const TIMEOUT_MS = 20000

let currentAbortController: AbortController | null = null

export function abortPendingRequests() {
  if (currentAbortController) {
    currentAbortController.abort()
    currentAbortController = null
  }
}

export function resetAbortController() {
  if (currentAbortController) {
    currentAbortController.abort()
  }
  currentAbortController = new AbortController()
}

export async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  const timeoutController = new AbortController()
  const timer = setTimeout(() => timeoutController.abort(), TIMEOUT_MS)

  const abortListener = () => timeoutController.abort()
  if (currentAbortController) {
    currentAbortController.signal.addEventListener('abort', abortListener, { once: true })
  }

  try {
    return await fetch(url, { ...options, signal: timeoutController.signal })
  } finally {
    clearTimeout(timer)
    if (currentAbortController) {
      currentAbortController.signal.removeEventListener('abort', abortListener)
    }
  }
}

export async function readBody(res: Response): Promise<unknown> {
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return text.slice(0, 2000)
  }
}

export async function postJson(path: string, body: unknown): Promise<{ res: Response; data: unknown }> {
  const res = await safeFetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return { res, data: await readBody(res) }
}

// ── Shared VP session state ─────────────────────────────────────────────────
// /v2/vp-request hands back a transactionId and requestId that the submission
// and result steps both need, so the run threads them through here.
export interface VpSession {
  transactionId: string
  requestId: string
  nonce: string
  responseUri: string
  requestUri?: string
  expiresAt?: number
  dcqlQuery: DcqlQuery
  clientId?: string
}

let currentVpSession: VpSession | null = null

export function getVpSession(): VpSession | null {
  return currentVpSession
}

export function setVpSession(session: VpSession | null): void {
  currentVpSession = session
}

export function resetVpSession(): void {
  currentVpSession = null
}
