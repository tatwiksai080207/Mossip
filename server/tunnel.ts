import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import type express from 'express'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const tunnelFile = path.join(__dirname, '../scratch/tunnel.json')
const serverTunnelFile = path.join(__dirname, '.tunnel.json')
const legacyRootTunnelFile = path.join(__dirname, '../.tunnel.json')

let activeTunnelUrl = (process.env.PUBLIC_BASE_URL || '').trim()

export function getActiveTunnelUrl(): string {
  if (activeTunnelUrl && !activeTunnelUrl.includes('localhost') && !activeTunnelUrl.includes('127.0.0.1')) {
    return activeTunnelUrl
  }
  try {
    for (const f of [serverTunnelFile, tunnelFile, legacyRootTunnelFile]) {
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

export function syncMimotoTrustedVerifiers(url: string) {
  const cleanUrl = (url || '').trim().replace(/\/$/, '')
  const isExternal = Boolean(
    cleanUrl &&
    !cleanUrl.includes('localhost') &&
    !cleanUrl.includes('127.0.0.1') &&
    !cleanUrl.includes('host.docker.internal')
  )

  try {
    const verifiersFile = path.join(__dirname, '../mosip-stack/config/mimoto-trusted-verifiers.json')
    if (fs.existsSync(verifiersFile)) {
      const data = JSON.parse(fs.readFileSync(verifiersFile, 'utf-8'))
      const verifiers = data?.verifiers
      if (Array.isArray(verifiers)) {
        // Strip any stale third-party or tunnel domains other than the current cleanUrl
        const isStaleTunnel = (u: string) =>
          (u.includes('.ngrok') || u.includes('.loca.lt') || u.includes('trycloudflare.com')) &&
          (!isExternal || !u.startsWith(cleanUrl))

        for (const v of verifiers) {
          if (Array.isArray(v.redirect_uris)) {
            v.redirect_uris = v.redirect_uris.filter((u: string) => !isStaleTunnel(u))
          }
          if (Array.isArray(v.redirect_uri)) {
            v.redirect_uri = v.redirect_uri.filter((u: string) => !isStaleTunnel(u))
          }
          if (Array.isArray(v.response_uris)) {
            v.response_uris = v.response_uris.filter((u: string) => !isStaleTunnel(u))
          }

          if (isExternal) {
            // Point JWKS to the live public tunnel so Mimoto can fetch the verifier key
            if (['localhost-verifier', 'did:web:verify-service:v1:verify', 'waltid-verifier', 'sphereon-verifier'].includes(v.client_id)) {
              v.jwks_uri = `${cleanUrl}/api/verifier/jwks.json`
            }

            if (v.client_id === 'localhost-verifier' || v.client_id === 'did:web:verify-service:v1:verify') {
              const resUris = new Set(v.response_uris || [])
              resUris.add(`${cleanUrl}/v1/verify/v2/vp-submission/direct-post`)
              resUris.add(`${cleanUrl}/v1/verify/vp-submission/direct-post`)
              v.response_uris = Array.from(resUris)

              const redUris = new Set(v.redirect_uris || [])
              redUris.add(cleanUrl)
              redUris.add(`${cleanUrl}/`)
              v.redirect_uris = Array.from(redUris)
              v.redirect_uri = v.redirect_uris
            } else if (v.client_id === 'waltid-verifier') {
              const resUris = new Set(v.response_uris || [])
              resUris.add(`${cleanUrl}/api/external/waltid/verifier/v1/verify/vp-submission/direct-post`)
              v.response_uris = Array.from(resUris)

              const redUris = new Set(v.redirect_uris || [])
              redUris.add(`${cleanUrl}/api/external/waltid/verifier`)
              v.redirect_uris = Array.from(redUris)
              v.redirect_uri = v.redirect_uris
            } else if (v.client_id === 'sphereon-verifier') {
              const resUris = new Set(v.response_uris || [])
              resUris.add(`${cleanUrl}/api/external/sphereon/verifier/v1/verify/vp-submission/direct-post`)
              v.response_uris = Array.from(resUris)

              const redUris = new Set(v.redirect_uris || [])
              redUris.add(`${cleanUrl}/api/external/sphereon/verifier`)
              v.redirect_uris = Array.from(redUris)
              v.redirect_uri = v.redirect_uris
            }
          } else {
            // Restore default Docker-internal JWKS URI
            if (['localhost-verifier', 'did:web:verify-service:v1:verify', 'waltid-verifier', 'sphereon-verifier'].includes(v.client_id)) {
              v.jwks_uri = 'http://host.docker.internal:3001/api/verifier/jwks.json'
            }
          }
        }
        fs.writeFileSync(verifiersFile, JSON.stringify(data, null, 2), 'utf-8')
      }
    }
  } catch (err) {
    console.error('[tunnel] Error syncing mimoto-trusted-verifiers.json:', err)
  }
}

export function syncInjiWebConfig(clientId?: string): void {
  const googleClientId = (clientId ?? process.env.GOOGLE_OAUTH_CLIENT_ID ?? '').trim()
  try {
    const envConfigFile = path.join(__dirname, '../mosip-stack/config/env-config.js')
    if (fs.existsSync(envConfigFile)) {
      let content = fs.readFileSync(envConfigFile, 'utf-8')
      content = content.replace(
        /GOOGLE_CLIENT_ID:\s*"[^"]*"/,
        `GOOGLE_CLIENT_ID: "${googleClientId}"`
      )
      fs.writeFileSync(envConfigFile, content, 'utf-8')
      if (googleClientId) {
        console.log('[config] Synchronized GOOGLE_OAUTH_CLIENT_ID to mosip-stack/config/env-config.js')
      }
    }
  } catch (err) {
    console.error('[config] Error syncing env-config.js:', err)
  }
}

export function setTunnelUrl(url: string): string {
  activeTunnelUrl = String(url).trim().replace(/\/$/, '')
  try {
    fs.mkdirSync(path.dirname(tunnelFile), { recursive: true })
    fs.writeFileSync(tunnelFile, JSON.stringify({ tunnelUrl: activeTunnelUrl }), 'utf-8')
    fs.writeFileSync(serverTunnelFile, JSON.stringify({ tunnelUrl: activeTunnelUrl }), 'utf-8')
    syncMimotoTrustedVerifiers(activeTunnelUrl)
  } catch { }
  return activeTunnelUrl
}

// Initial bootstrap synchronization
try {
  const startupTunnel = getActiveTunnelUrl()
  if (startupTunnel && !startupTunnel.includes('localhost') && !startupTunnel.includes('127.0.0.1')) {
    syncMimotoTrustedVerifiers(startupTunnel)
  } else {
    syncMimotoTrustedVerifiers('')
  }
  syncInjiWebConfig()
} catch { }

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
