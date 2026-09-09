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
  tamperMode: 'none' | 'signature' | 'expired'
  selectedStepId: FlowStepInfo['id'] | null

  selectIssuer: (issuer: IssuerConfig) => void
  selectWallet: (wallet: WalletConfig) => void
  selectVerifier: (verifier: VerifierConfig) => void
  selectCredType: (ct: CredentialType) => void
  setTamperMode: (mode: 'none' | 'signature' | 'expired') => void
  selectStep: (id: FlowStepInfo['id'] | null) => void
  runFlow: () => Promise<void>
  resumeOAuthFlow: (code: string) => void
  clearHistory: () => void
  continueVerification: () => Promise<void>
  checkVerificationResult: () => Promise<void>
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
  tamperMode: 'none',
  selectedStepId: null,

  _resumeResolver: null as ((code: string) => void) | null,

  selectStep: (id) => set((state) => ({
    selectedStepId: state.selectedStepId === id ? null : id,
  })),

  selectIssuer: (issuer) => {
    set({
      selectedIssuer: issuer,
      selectedCredType: issuer.credentialTypes[0] || null,
    })
  },

  selectWallet: (wallet) => set({ selectedWallet: wallet }),
  selectVerifier: (verifier) => set({ selectedVerifier: verifier }),
  selectCredType: (ct) => set({ selectedCredType: ct }),
  setTamperMode: (mode) => {
    set({ tamperMode: mode })
    fetch('/api/tamper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tamperMode: mode }),
    }).catch(err => console.error('Failed to sync tamper mode:', err))
  },
  clearHistory: () => set({ history: [] }),

  runFlow: async () => {
    const { selectedIssuer, selectedWallet, selectedVerifier, selectedCredType, tamperMode } = get()
    if (!selectedIssuer || !selectedWallet || !selectedVerifier || !selectedCredType) return

    fetch('/api/tamper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tamperMode }),
    }).catch(err => console.error('Failed to sync tamper mode on runFlow:', err))

    set({ isRunning: true, selectedStepId: null })
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
      'vp-request': () => api.createVPRequest(selectedCredType, selectedVerifier),
      'vp-response': () => api.submitVPResponse(selectedVerifier, { tamper: get().tamperMode }),
      'verification': () => api.verifyPresentation(selectedVerifier, { isTampered: get().tamperMode !== 'none' }),
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
        
        // Stop early if manual mode is enabled and we just generated the offer
        if ((selectedWallet.id === 'inji-web-manual' || selectedWallet.id === 'inji-mobile') && stepId === 'credential-offer') {
          // Mark remaining steps as skipped
          set({ steps: get().steps.map((s, idx) =>
            idx > i ? { ...s, status: 'pending', payload: { _note: 'Manual mode: waiting for user to complete flow.' } } : s
          )})
          break;
        }
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
        tamperMode: get().tamperMode,
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

  continueVerification: async () => {
    const { steps, selectedCredType, selectedVerifier, tamperMode } = get()
    if (!selectedCredType || !selectedVerifier) return

    fetch('/api/tamper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tamperMode }),
    }).catch(err => console.error('Failed to sync tamper mode on continueVerification:', err))

    set({ isRunning: true })

    const vpRequestIdx = steps.findIndex(s => s.id === 'vp-request')
    if (vpRequestIdx === -1) return

    set({ steps: get().steps.map((s, idx) =>
      idx === vpRequestIdx ? { ...s, status: 'running' } : s
    )})

    try {
      const result = await api.createVPRequest(selectedCredType, selectedVerifier)
      set({ steps: get().steps.map((s, idx) => {
        if (idx === vpRequestIdx) return { ...s, status: 'done', payload: result.payload, source: result.source }
        if (idx > vpRequestIdx) return { ...s, status: 'pending', payload: { _note: 'Manual mode: waiting for user to verify.' } }
        return s
      })})
    } catch (err: unknown) {
      const errObj = err as { stepPayload?: Record<string, unknown>; message?: string }
      const payload = errObj.stepPayload
        ? { _error: errObj.message, ...errObj.stepPayload }
        : { _error: String(err) }
      
      set({ steps: get().steps.map((s, idx) =>
        idx === vpRequestIdx ? { ...s, status: 'error', payload, source: 'live' } : s
      )})
    }

    set({ isRunning: false })
  },

  checkVerificationResult: async () => {
    const { steps, selectedVerifier } = get()
    if (!selectedVerifier) return

    set({ isRunning: true })

    const verificationIdx = steps.findIndex(s => s.id === 'verification')
    if (verificationIdx === -1) return

    set({ steps: get().steps.map((s, idx) =>
      idx === verificationIdx ? { ...s, status: 'running' } : s
    )})

    try {
      const result = await api.verifyPresentation(selectedVerifier, { isTampered: get().tamperMode !== 'none' })
      const isManual = get().selectedWallet?.id === 'inji-web-manual' || get().selectedWallet?.id === 'inji-mobile'
      set({ steps: get().steps.map((s, idx) => {
        if (idx === verificationIdx) return { ...s, status: 'done', payload: result.payload, source: result.source }
        if (isManual && s.status === 'pending') {
          return { ...s, status: 'done', payload: { ...(typeof s.payload === 'object' ? s.payload : {}), _note: 'Completed via external wallet app' }, source: 'live' }
        }
        return s
      })})
    } catch (err: unknown) {
      const errObj = err as { stepPayload?: Record<string, unknown>; message?: string }
      const payload = errObj.stepPayload
        ? { _error: errObj.message, ...errObj.stepPayload }
        : { _error: String(err) }
      
      set({ steps: get().steps.map((s, idx) =>
        idx === verificationIdx ? { ...s, status: 'error', payload, source: 'live' } : s
      )})
    }

    // save to history
    const finalSteps = get().steps
    const allPassed = finalSteps.every(s => s.status === 'done' || (s.status === 'pending' && s.payload && (s.payload as any)._note))
    const run: TestRun = {
      id: `run-${Date.now()}`,
      config: {
        issuer: get().selectedIssuer!,
        wallet: get().selectedWallet!,
        verifier: get().selectedVerifier!,
        credentialType: get().selectedCredType!,
      },
      steps: finalSteps,
      result: allPassed ? 'pass' : 'fail',
      timestamp: Date.now(),
    }

    set({ isRunning: false, history: [run, ...get().history] })
  }
}))
