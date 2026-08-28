import { create } from 'zustand'
import * as api from './api'
import type { IssuerConfig, WalletConfig, VerifierConfig, CredentialType, FlowStepInfo, StepStatus, TestRun } from './types'

const FLOW_STEPS: { id: FlowStepInfo['id']; label: string }[] = [
  { id: 'issuer-metadata', label: 'Issuer Metadata Discovery' },
  { id: 'credential-offer', label: 'Credential Offer' },
  { id: 'token-exchange', label: 'Token Exchange' },
  { id: 'credential-issuance', label: 'Credential Issuance' },
  { id: 'vp-request', label: 'VP Authorization Request' },
  { id: 'vp-response', label: 'VP Token Response' },
  { id: 'verification', label: 'Verification Result' },
]

interface PlaygroundStore {
  selectedIssuer: IssuerConfig | null
  selectedWallet: WalletConfig | null
  selectedVerifier: VerifierConfig | null
  selectedCredType: CredentialType | null
  steps: FlowStepInfo[]
  isRunning: boolean
  history: TestRun[]

  selectIssuer: (issuer: IssuerConfig) => void
  selectWallet: (wallet: WalletConfig) => void
  selectVerifier: (verifier: VerifierConfig) => void
  selectCredType: (ct: CredentialType) => void
  runFlow: () => Promise<void>
  clearHistory: () => void
}

export const useStore = create<PlaygroundStore>((set, get) => ({
  selectedIssuer: null,
  selectedWallet: null,
  selectedVerifier: null,
  selectedCredType: null,
  steps: [],
  isRunning: false,
  history: [],

  selectIssuer: (issuer) => {
    set({
      selectedIssuer: issuer,
      selectedCredType: issuer.credentialTypes[0] || null,
    })
  },

  selectWallet: (wallet) => set({ selectedWallet: wallet }),
  selectVerifier: (verifier) => set({ selectedVerifier: verifier }),
  selectCredType: (ct) => set({ selectedCredType: ct }),
  clearHistory: () => set({ history: [] }),

  runFlow: async () => {
    const { selectedIssuer, selectedWallet, selectedVerifier, selectedCredType } = get()
    if (!selectedIssuer || !selectedWallet || !selectedVerifier || !selectedCredType) return

    set({ isRunning: true })

    const initial: FlowStepInfo[] = FLOW_STEPS.map(s => ({
      ...s, status: 'pending' as StepStatus,
    }))
    set({ steps: initial })

    // map step IDs to API calls
    const stepActions: Record<string, () => Promise<{ payload: unknown; source: 'live' | 'mock' }>> = {
      'issuer-metadata': () => api.fetchIssuerMetadata(selectedIssuer),
      'credential-offer': () => api.createCredentialOffer(selectedIssuer, selectedCredType),
      'token-exchange': () => api.exchangeToken(selectedCredType),
      'credential-issuance': () => api.requestCredential(selectedCredType),
      'vp-request': () => api.createVPRequest(selectedCredType),
      'vp-response': () => api.submitVPResponse(selectedCredType),
      'verification': () => api.verifyPresentation(),
    }

    for (let i = 0; i < FLOW_STEPS.length; i++) {
      const stepId = FLOW_STEPS[i].id

      // mark as running
      set({ steps: get().steps.map((s, idx) =>
        idx === i ? { ...s, status: 'running' } : s
      )})

      try {
        const result = await stepActions[stepId]()
        set({ steps: get().steps.map((s, idx) =>
          idx === i ? { ...s, status: 'done', payload: result.payload, source: result.source } : s
        )})
      } catch (err: unknown) {
        // Extract diagnostic payload if the error carries one (e.g. 403 from credential issuance)
        const errObj = err as { stepPayload?: unknown; message?: string }
        const payload = errObj.stepPayload || { error: String(err) }
        set({ steps: get().steps.map((s, idx) =>
          idx === i ? { ...s, status: 'error', payload, source: 'live' } : s
        )})
        // Don't break — continue to verification steps so the full flow is visible
      }
    }

    // save to history
    const finalSteps = get().steps
    const allPassed = finalSteps.every(s => s.status === 'done')
    const run: TestRun = {
      id: `run-${Date.now()}`,
      config: {
        issuer: selectedIssuer,
        wallet: selectedWallet,
        verifier: selectedVerifier,
        credentialType: selectedCredType,
      },
      steps: finalSteps,
      result: allPassed ? 'pass' : 'fail',
      timestamp: Date.now(),
    }

    set({ isRunning: false, history: [run, ...get().history] })
  },
}))
