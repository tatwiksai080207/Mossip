/**
 * Centralized, validated environment configuration with zero-config fallbacks.
 *
 * Provides a single source of truth for runtime ports, Collab sandbox endpoints,
 * local Docker URLs, database connection credentials, key seeds, and feature flags.
 */

export interface DatabaseConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export interface EndpointsConfig {
  issuer: string
  esignet: string
  esignetMock: string
  verifier: string
  mimoto: string
  localCertify: string
  localVerifier: string
  localMimoto: string
}

export interface SecretsConfig {
  certifyKeySeed: string
  oidcKeystorePassword?: string
  walletBindingPartnerApiKey?: string
  googleOAuthClientId?: string
  googleOAuthClientSecret?: string
}

export interface PortsConfig {
  server: number
  vite: number
  injiWeb: number
}

export interface AppConfig {
  port: number
  nodeEnv: string
  serveStatic: boolean
  publicBaseUrl: string | null
  endpoints: EndpointsConfig
  database: DatabaseConfig
  secrets: SecretsConfig
  ports: PortsConfig
  waltidEnabled: boolean
}

function parsePort(val: string | undefined, fallback: number): number {
  if (!val) return fallback
  const parsed = parseInt(val, 10)
  return isNaN(parsed) ? fallback : parsed
}

export const env: AppConfig = {
  port: parsePort(process.env.PORT, 3001),
  nodeEnv: process.env.NODE_ENV || 'development',
  serveStatic: process.env.SERVE_STATIC === 'true',
  publicBaseUrl: process.env.PUBLIC_BASE_URL || null,

  endpoints: {
    issuer: process.env.COLLAB_CERTIFY_URL || 'https://injicertify-mock.collab.mosip.net',
    esignet: process.env.COLLAB_ESIGNET_URL || 'https://esignet.collab.mosip.net',
    esignetMock: process.env.COLLAB_ESIGNET_MOCK_URL || 'https://esignet-mock.collab.mosip.net',
    verifier: process.env.COLLAB_VERIFY_URL || 'https://injiverify.collab.mosip.net',
    mimoto: process.env.COLLAB_MIMOTO_URL || 'https://api.collab.mosip.net/v1/mimoto',
    localCertify: process.env.LOCAL_CERTIFY_URL || 'http://127.0.0.1:8090/v1/certify',
    localVerifier: process.env.LOCAL_VERIFIER_URL || 'http://127.0.0.1:8095',
    localMimoto: process.env.LOCAL_MIMOTO_URL || 'http://127.0.0.1:8099/v1/mimoto',
  },

  database: {
    host: process.env.DATABASE_HOST || 'localhost',
    port: parsePort(process.env.DATABASE_PORT, 5433),
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    database: process.env.POSTGRES_DB || 'inji_mimoto',
  },

  secrets: {
    certifyKeySeed: process.env.CERTIFY_KEY_SEED || 'mossip-certify-ed25519-seed-32b!',
    oidcKeystorePassword: process.env.OIDC_KEYSTORE_PASSWORD || 'xy4gh6swa2i',
    walletBindingPartnerApiKey: process.env.WALLET_BINDING_PARTNER_API_KEY || 'dummywalletbindingpartnerapikey',
    googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID || '',
    googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET || '',
  },

  ports: {
    server: parsePort(process.env.PORT, 3001),
    vite: parsePort(process.env.VITE_PORT, 3000),
    injiWeb: parsePort(process.env.INJI_WEB_PORT, 3004),
  },

  waltidEnabled: process.env.WALTID_ISSUER_ENABLED !== 'false',
}
