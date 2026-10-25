import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')
const envPath = path.join(rootDir, '.env')

export function loadRootEnv(): void {
  try {
    if (fs.existsSync(envPath)) {
      if (typeof process.loadEnvFile === 'function') {
        process.loadEnvFile(envPath)
      } else {
        const content = fs.readFileSync(envPath, 'utf-8')
        for (const line of content.split('\n')) {
          const trimmed = line.trim()
          if (!trimmed || trimmed.startsWith('#')) continue
          const eq = trimmed.indexOf('=')
          if (eq > 0) {
            const k = trimmed.slice(0, eq).trim()
            const v = trimmed.slice(eq + 1).trim()
            if (!process.env[k]) process.env[k] = v
          }
        }
      }

      // Auto-sync .env into mosip-stack/.env so Docker Compose running in mosip-stack always receives variables
      const mosipStackDir = path.join(rootDir, 'mosip-stack')
      if (fs.existsSync(mosipStackDir)) {
        const mosipStackEnv = path.join(mosipStackDir, '.env')
        try {
          fs.copyFileSync(envPath, mosipStackEnv)
        } catch { }
      }
    }
  } catch (err) {
    console.warn('[load-env] Could not load .env file:', err)
  }
}

// Load immediately on module evaluation
loadRootEnv()
