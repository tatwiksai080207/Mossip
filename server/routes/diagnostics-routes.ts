import { Router, type Request, type Response } from 'express'
import { env } from '../config/env'
import { getMimotoDbClient } from './mimoto/db-bridge'
import { getActiveTunnelUrl } from '../tunnel'

export interface ServiceDiagnostic {
  name: string
  target: string
  status: 'UP' | 'DOWN' | 'STANDBY'
  latencyMs?: number
  note?: string
}

export interface DiagnosticsReport {
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'OFFLINE'
  timestamp: string
  tunnelUrl: string | null
  activeEnvironment: string
  checks: ServiceDiagnostic[]
}

async function probeHttp(name: string, url: string, timeoutMs = 2500): Promise<ServiceDiagnostic> {
  const start = Date.now()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(url, { signal: controller.signal, method: 'GET' })
    clearTimeout(timer)
    const latencyMs = Date.now() - start
    const status = res.status < 500 ? 'UP' : 'DOWN'
    return {
      name,
      target: url,
      status,
      latencyMs,
      note: `HTTP ${res.status} ${res.statusText}`,
    }
  } catch (err: unknown) {
    clearTimeout(timer)
    const latencyMs = Date.now() - start
    const isAbort = (err as Error)?.name === 'AbortError'
    return {
      name,
      target: url,
      status: 'DOWN',
      latencyMs,
      note: isAbort ? `Timeout after ${timeoutMs}ms` : (err as Error)?.message || 'Connection failed',
    }
  }
}

async function probeDatabase(): Promise<ServiceDiagnostic> {
  const start = Date.now()
  try {
    const client = await getMimotoDbClient()
    await client.query('SELECT 1')
    await client.end()
    return {
      name: 'Local PostgreSQL Datastore (Mimoto DB)',
      target: `${env.database.user}@${env.database.host}:${env.database.port}/${env.database.database}`,
      status: 'UP',
      latencyMs: Date.now() - start,
      note: 'Database query (SELECT 1) succeeded',
    }
  } catch (err: unknown) {
    return {
      name: 'Local PostgreSQL Datastore (Mimoto DB)',
      target: `${env.database.user}@${env.database.host}:${env.database.port}/${env.database.database}`,
      status: 'STANDBY',
      latencyMs: Date.now() - start,
      note: (err as Error)?.message || 'Database offline (in-memory mode active)',
    }
  }
}

export const diagnosticsRouter = Router()

diagnosticsRouter.get('/api/diagnostics', async (_req: Request, res: Response) => {
  const probes = await Promise.all([
    probeHttp('MOSIP Collab Inji Certify', `${env.endpoints.issuer}/.well-known/openid-credential-issuer`),
    probeHttp('MOSIP Collab Inji Verify', `${env.endpoints.verifier}/v1/verify/v2/vc-verification`),
    probeHttp('MOSIP Collab eSignet IdP', `${env.endpoints.esignet}/.well-known/openid-configuration`),
    probeHttp('MOSIP Collab Mimoto BFF', `${env.endpoints.mimoto}/actuator/health`),
    probeDatabase(),
  ])

  const upCount = probes.filter((p) => p.status === 'UP').length
  const downCount = probes.filter((p) => p.status === 'DOWN').length

  let overallStatus: 'HEALTHY' | 'DEGRADED' | 'OFFLINE' = 'HEALTHY'
  if (downCount > 2) {
    overallStatus = 'OFFLINE'
  } else if (downCount > 0 || upCount < probes.length) {
    overallStatus = 'DEGRADED'
  }

  const report: DiagnosticsReport = {
    overallStatus,
    timestamp: new Date().toISOString(),
    tunnelUrl: getActiveTunnelUrl(),
    activeEnvironment: env.nodeEnv,
    checks: probes,
  }

  res.json(report)
})
