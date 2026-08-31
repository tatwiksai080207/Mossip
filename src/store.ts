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
  pausedStep: FlowStepInfo['id'] | null
  oauthUrl: string | null
  history: TestRun[]

  selectIssuer: (issuer: IssuerConfig) => void
  selectWallet: (wallet: WalletConfig) => void
  selectVerifier: (verifier: VerifierConfig) => void
  selectCredType: (ct: CredentialType) => void
  runFlow: () => Promise<void>
  resumeOAuthFlow: (code: string) => void
  clearHistory: () => void
}

export const useStore = create<PlaygroundStore>((set, get) => ({
  selectedIssuer: null,
  selectedWallet: null,
  selectedVerifier: null,
  selectedCredType: null,
  steps: [],
  isRunning: false,
  pausedStep: null,
  oauthUrl: null,
  history: [],

  _resumeResolver: null as ((code: string) => void) | null,

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
    api.resetVpSession()

    const initial: FlowStepInfo[] = FLOW_STEPS.map(s => ({
      ...s, status: 'pending' as StepStatus,
    }))
    set({ steps: initial })

    // map step IDs to API calls
    const stepActions: Record<string, () => Promise<{ payload: unknown; source: 'live' | 'mock' }>> = {
      'issuer-metadata': () => api.fetchIssuerMetadata(selectedIssuer),
      'credential-offer': () => api.createCredentialOffer(selectedIssuer, selectedCredType),
      'token-exchange': () => api.exchangeToken(selectedIssuer, selectedCredType),
      'credential-issuance': () => api.requestCredential(selectedIssuer, selectedCredType),
      'vp-request': () => api.createVPRequest(selectedCredType),
      'vp-response': () => api.submitVPResponse(),
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
        const errObj = err as { stepPayload?: Record<string, unknown>; message?: string; oauthUrl?: string }
        
        if (errObj.message === 'OAuthPauseRequired' && errObj.oauthUrl) {
          set({
            pausedStep: stepId,
            oauthUrl: errObj.oauthUrl,
            steps: get().steps.map((s, idx) =>
              idx === i ? { ...s, status: 'running' } : s
            )
          })

          const code = await new Promise<string>(resolve => {
            set({ _resumeResolver: resolve } as Partial<PlaygroundStore>)
          })

          set({ pausedStep: null, oauthUrl: null, _resumeResolver: null } as Partial<PlaygroundStore>)
          
          // Retry the step (assuming the API orchestrator will pick up the code or state)
          // We pass the code to the exchangeToken step. We need to modify stepActions for token-exchange
          if (stepId === 'token-exchange') {
            const result = await api.exchangeToken(get().selectedIssuer!, get().selectedCredType!, code)
            set({ steps: get().steps.map((s, idx) =>
              idx === i ? { ...s, status: 'done', payload: result.payload, source: result.source } : s
            )})
          }
          continue;
        }

        // StepError carries a diagnostic payload; anything else is unexpected.
        const payload = errObj.stepPayload
          ? { _error: errObj.message, ...errObj.stepPayload }
          : { _error: String(err) }
        set({ steps: get().steps.map((s, idx) =>
          idx === i ? { ...s, status: 'error', payload, source: 'live' } : s
        )})
        // Keep going so the rest of the protocol is still visible.
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

  resumeOAuthFlow: (code: string) => {
    const resolver = (get() as any)._resumeResolver
    if (resolver) {
      resolver(code)
    }
  },
}))
