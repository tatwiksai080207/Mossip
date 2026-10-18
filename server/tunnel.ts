import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type express from 'express'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tunnelFile = path.join(__dirname, '../scratch/tunnel.json')
const rootTunnelFile = path.join(__dirname, '../.tunnel.json')

let activeTunnelUrl = (process.env.PUBLIC_BASE_URL || '').trim()

export function getActiveTunnelUrl(): string {
  if (activeTunnelUrl && !activeTunnelUrl.includes('localhost') && !activeTunnelUrl.includes('127.0.0.1')) {
    return activeTunnelUrl
  }
  try {
    for (const f of [tunnelFile, rootTunnelFile]) {
      if (fs.existsSync(f)) {
        const raw = JSON.parse(fs.readFileSync(f, 'utf-8'))
        if (raw?.tunnelUrl) {
          activeTunnelUrl = String(raw.tunnelUrl).trim()
          return activeTunnelUrl
        }
      }
    }
  } catch { }
  return activeTunnelUrl || 'http://localhost:3001'
}

function syncMimotoTrustedVerifiers(url: string) {
  if (!url || url.includes('localhost') || url.includes('127.0.0.1')) return
  try {
    const verifiersFile = path.join(__dirname, '../mosip-stack/config/mimoto-trusted-verifiers.json')
    if (fs.existsSync(verifiersFile)) {
      const data = JSON.parse(fs.readFileSync(verifiersFile, 'utf-8'))
      const verifiers = data?.verifiers
      if (Array.isArray(verifiers)) {
        for (const v of verifiers) {
          if (v.client_id === 'localhost-verifier') {
            const resUris = new Set(v.response_uris || [])
            resUris.add(`${url}/v1/verify/v2/vp-submission/direct-post`)
            resUris.add(`${url}/v1/verify/vp-submission/direct-post`)
            v.response_uris = Array.from(resUris)

            const redUris = new Set(v.redirect_uris || [])
            redUris.add(url)
            redUris.add(`${url}/`)
            v.redirect_uris = Array.from(redUris)
            v.redirect_uri = v.redirect_uris
          }
        }
        fs.writeFileSync(verifiersFile, JSON.stringify(data, null, 2), 'utf-8')
      }
    }
  } catch (err) {
    console.error('[tunnel] Error syncing mimoto-trusted-verifiers.json:', err)
  }
}

export function setTunnelUrl(url: string): string {
  activeTunnelUrl = String(url).trim().replace(/\/$/, '')
  try {
    fs.mkdirSync(path.dirname(tunnelFile), { recursive: true })
    fs.writeFileSync(tunnelFile, JSON.stringify({ tunnelUrl: activeTunnelUrl }), 'utf-8')
    fs.writeFileSync(rootTunnelFile, JSON.stringify({ tunnelUrl: activeTunnelUrl }), 'utf-8')
    syncMimotoTrustedVerifiers(activeTunnelUrl)
  } catch { }
  return activeTunnelUrl
}

export function getPublicBaseUrl(req?: express.Request): string {
  const tunnel = getActiveTunnelUrl().trim().replace(/\/$/, '')
  const hasExternalTunnel = Boolean(
    tunnel &&
    !tunnel.includes('localhost') &&
    !tunnel.includes('127.0.0.1') &&
    !tunnel.includes('host.docker.internal')
  )

  // If an external tunnel is configured (e.g. ngrok), ALWAYS prioritize it so
  // mobile wallets and external clients receive reachable HTTPS URLs.
  if (hasExternalTunnel && tunnel) {
    return tunnel
  }

  if (req) {
    const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http'
    const host = (req.headers['x-forwarded-host'] as string) || req.headers.host
    const isInternal = !host ||
      host.includes('localhost') ||
      host.includes('127.0.0.1') ||
      host.includes('host.docker.internal') ||
      host.includes('inji-playground') ||
      host.includes('verify-service') ||
      host.includes('certify') ||
      host.includes('mimoto') ||
      host.endsWith(':3001');
    if (!isInternal && host) {
      return `${proto}://${host}`.trim()
    }
    if (host) {
      return `${proto}://${host}`.trim()
    }
  }

  return tunnel || 'http://localhost:3001'
}
