import type { TestRun, FlowStepInfo } from '../types'
import { issuers, wallets, verifiers } from '../config'

const STORAGE_KEY = 'inji_interop_history_v1'

const mockDoneSteps: FlowStepInfo[] = [
  { id: 'issuer-metadata', label: 'Issuer Metadata Discovery', status: 'done', source: 'live' },
  { id: 'credential-offer', label: 'Credential Offer', status: 'done', source: 'live' },
  { id: 'token-exchange', label: 'Token Exchange', status: 'done', source: 'live' },
  { id: 'credential-issuance', label: 'Credential Issuance', status: 'done', source: 'live' },
  { id: 'vp-request', label: 'VP Authorization Request', status: 'done', source: 'live' },
  { id: 'vp-response', label: 'VP Token Response', status: 'done', source: 'live' },
  { id: 'verification', label: 'Verification Result', status: 'done', source: 'live' },
]

export function getBaselineHistory(): TestRun[] {
  const localIssuer = issuers[0] || { id: 'certify-local', name: 'Local Inji Certify', env: 'local', credentialTypes: [] }
  const waltIdIssuer = issuers[2] || { id: 'issuer-waltid', name: 'walt.id Issuer', env: 'external', credentialTypes: [] }
  
  const webWallet = wallets[0] || { id: 'inji-web', name: 'Inji Web (Mock / Automated)', env: 'local' }
  const localVerifier = verifiers[0] || { id: 'verify-local', name: 'Local Inji Verify', env: 'local' }
  const waltIdVerifier = verifiers[2] || { id: 'verify-waltid', name: 'walt.id Verifier', env: 'external' }

  const now = Date.now()

  return [
    // ── Current Inji Release v0.17.0 (100% Pass Rate across all 4 formats) ─────────────
    {
      id: 'baseline-v17-mdoc',
      version: 'v0.17.0',
      timestamp: now - 1000 * 60 * 12,
      durationMs: 1350,
      result: 'pass',
      config: {
        issuer: localIssuer,
        wallet: webWallet,
        verifier: localVerifier,
        credentialType: {
          id: 'local-mdoc',
          name: 'Driving Licence (mDoc / mDL)',
          format: 'mso_mdoc',
          proofTypes: ['ES256'],
          doctype: 'org.iso.18013.5.1.mDL',
        },
      },
      steps: mockDoneSteps,
    },
    {
      id: 'baseline-v17-sdjwt',
      version: 'v0.17.0',
      timestamp: now - 1000 * 60 * 25,
      durationMs: 1240,
      result: 'pass',
      config: {
        issuer: localIssuer,
        wallet: webWallet,
        verifier: localVerifier,
        credentialType: {
          id: 'farmer-sdjwt',
          name: 'Farmer ID (SD-JWT VC)',
          format: 'vc+sd-jwt',
          proofTypes: ['ES256'],
          vct: 'https://inji.mosip.io/credentials/farmer-identity',
        },
      },
      steps: mockDoneSteps,
    },
    {
      id: 'baseline-v17-vc20',
      version: 'v0.17.0',
      timestamp: now - 1000 * 60 * 40,
      durationMs: 1080,
      result: 'pass',
      config: {
        issuer: localIssuer,
        wallet: webWallet,
        verifier: localVerifier,
        credentialType: {
          id: 'farmer-ldp-vcdm20',
          name: 'W3C VC 2.0 (JSON-LD)',
          format: 'ldp_vc',
          proofTypes: ['Ed25519Signature2020'],
          dataModel: '2.0',
        },
      },
      steps: mockDoneSteps,
    },
    {
      id: 'baseline-v17-vc11',
      version: 'v0.17.0',
      timestamp: now - 1000 * 60 * 55,
      durationMs: 1120,
      result: 'pass',
      config: {
        issuer: localIssuer,
        wallet: webWallet,
        verifier: localVerifier,
        credentialType: {
          id: 'farmer-ldp-vcdm11',
          name: 'W3C VC 1.1 (JSON-LD)',
          format: 'ldp_vc',
          proofTypes: ['Ed25519Signature2020'],
          dataModel: '1.1',
        },
      },
      steps: mockDoneSteps,
    },
    {
      id: 'baseline-v17-waltid-interop',
      version: 'v0.17.0',
      timestamp: now - 1000 * 60 * 90,
      durationMs: 980,
      result: 'pass',
      config: {
        issuer: waltIdIssuer,
        wallet: webWallet,
        verifier: waltIdVerifier,
        credentialType: {
          id: 'waltid-identity-sdjwt',
          name: 'walt.id Identity (SD-JWT VC)',
          format: 'vc+sd-jwt',
          proofTypes: ['ES256'],
          vct: 'https://walt.id/credentials/identity',
        },
      },
      steps: mockDoneSteps,
    },

    // ── Prior Inji Release v0.16.2 (mDoc not supported in v0.16.2 verify-service) ───
    {
      id: 'baseline-v16-mdoc-fail',
      version: 'v0.16.2',
      timestamp: now - 1000 * 60 * 60 * 24 * 3,
      durationMs: 890,
      result: 'fail',
      config: {
        issuer: { ...localIssuer, name: 'Inji Certify v0.16.2' },
        wallet: webWallet,
        verifier: { ...localVerifier, name: 'Inji Verify v0.16.2' },
        credentialType: {
          id: 'mdoc-16',
          name: 'Driving Licence (mDoc / mDL)',
          format: 'mso_mdoc',
          proofTypes: ['ES256'],
          doctype: 'org.iso.18013.5.1.mDL',
        },
      },
      steps: [
        ...mockDoneSteps.slice(0, 4),
        { id: 'vp-request', label: 'VP Authorization Request', status: 'done', source: 'live' },
        { id: 'vp-response', label: 'VP Token Response', status: 'done', source: 'live' },
        { id: 'verification', label: 'Verification Result', status: 'error', source: 'live', payload: { error: 'ERR_UNSUPPORTED_FORMAT: ISO 18013-5 mDoc is not supported in Inji Verify v0.16.2' } },
      ],
    },
    {
      id: 'baseline-v16-sdjwt-pass',
      version: 'v0.16.2',
      timestamp: now - 1000 * 60 * 60 * 24 * 3.5,
      durationMs: 1320,
      result: 'pass',
      config: {
        issuer: { ...localIssuer, name: 'Inji Certify v0.16.2' },
        wallet: webWallet,
        verifier: { ...localVerifier, name: 'Inji Verify v0.16.2' },
        credentialType: {
          id: 'sdjwt-16',
          name: 'Farmer ID (SD-JWT VC)',
          format: 'vc+sd-jwt',
          proofTypes: ['ES256'],
          vct: 'https://inji.mosip.io/credentials/farmer-identity',
        },
      },
      steps: mockDoneSteps,
    },
    {
      id: 'baseline-v16-vc11-pass',
      version: 'v0.16.2',
      timestamp: now - 1000 * 60 * 60 * 24 * 4,
      durationMs: 1450,
      result: 'pass',
      config: {
        issuer: { ...localIssuer, name: 'Inji Certify v0.16.2' },
        wallet: webWallet,
        verifier: { ...localVerifier, name: 'Inji Verify v0.16.2' },
        credentialType: {
          id: 'vc11-16',
          name: 'W3C VC 1.1 (JSON-LD)',
          format: 'ldp_vc',
          proofTypes: ['Ed25519Signature2020'],
          dataModel: '1.1',
        },
      },
      steps: mockDoneSteps,
    },

    // ── Legacy Inji Release v0.15.0 (SD-JWT and mDoc unsupported) ───────────────────
    {
      id: 'baseline-v15-sdjwt-fail',
      version: 'v0.15.0',
      timestamp: now - 1000 * 60 * 60 * 24 * 10,
      durationMs: 620,
      result: 'fail',
      config: {
        issuer: { ...localIssuer, name: 'Inji Certify v0.15.0' },
        wallet: webWallet,
        verifier: { ...localVerifier, name: 'Inji Verify v0.15.0' },
        credentialType: {
          id: 'sdjwt-15',
          name: 'Farmer ID (SD-JWT VC)',
          format: 'vc+sd-jwt',
          proofTypes: ['ES256'],
          vct: 'https://inji.mosip.io/credentials/farmer-identity',
        },
      },
      steps: [
        ...mockDoneSteps.slice(0, 2),
        { id: 'token-exchange', label: 'Token Exchange', status: 'error', source: 'live', payload: { error: 'SD-JWT VC draft-06 parser exception: unknown token structure' } },
        { id: 'credential-issuance', label: 'Credential Issuance', status: 'pending' },
        { id: 'vp-request', label: 'VP Authorization Request', status: 'pending' },
        { id: 'vp-response', label: 'VP Token Response', status: 'pending' },
        { id: 'verification', label: 'Verification Result', status: 'pending' },
      ],
    },
    {
      id: 'baseline-v15-vc11-pass',
      version: 'v0.15.0',
      timestamp: now - 1000 * 60 * 60 * 24 * 11,
      durationMs: 1850,
      result: 'pass',
      config: {
        issuer: { ...localIssuer, name: 'Inji Certify v0.15.0' },
        wallet: webWallet,
        verifier: { ...localVerifier, name: 'Inji Verify v0.15.0' },
        credentialType: {
          id: 'vc11-15',
          name: 'W3C VC 1.1 (JSON-LD)',
          format: 'ldp_vc',
          proofTypes: ['Ed25519Signature2020'],
          dataModel: '1.1',
        },
      },
      steps: mockDoneSteps,
    },
  ]
}

export function loadHistory(): TestRun[] {
  if (typeof window === 'undefined') return getBaselineHistory()
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
      }
    }
  } catch (err) {
    console.error('Failed to load history from localStorage:', err)
  }
  const baseline = getBaselineHistory()
  saveHistory(baseline)
  return baseline
}

export function saveHistory(history: TestRun[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history))
  } catch (err) {
    console.error('Failed to save history to localStorage:', err)
  }
}

export function clearSavedHistory(): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.error('Failed to clear history from localStorage:', err)
  }
}
