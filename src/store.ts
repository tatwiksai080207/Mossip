import { create } from 'zustand'
import * as api from './api'
import type { IssuerConfig, WalletConfig, VerifierConfig, CredentialType, FlowStepInfo, StepStatus, TestRun, NetworkEvent } from './types'
import { issuers, wallets, verifiers } from './config'

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
  runTamperMode: 'none' | 'signature' | 'expired'
  selectedStepId: FlowStepInfo['id'] | null
  networkEvents: NetworkEvent[]
  _resumeResolver?: ((code: string) => void) | null

  selectIssuer: (issuer: IssuerConfig) => void
  selectWallet: (wallet: WalletConfig) => void
  selectVerifier: (verifier: VerifierConfig) => void
  selectCredType: (ct: CredentialType) => void
  setTamperMode: (mode: 'none' | 'signature' | 'expired') => void
  selectStep: (id: FlowStepInfo['id'] | null) => void
  runFlow: () => Promise<void>
  stopFlow: () => void
  resumeOAuthFlow: (code: string) => void
  cancelOAuthFlow: () => void
  clearHistory: () => void
  continueVerification: () => Promise<void>
  checkVerificationResult: () => Promise<void>
  addNetworkEvent: (event: Omit<NetworkEvent, 'timestamp'>) => void
  clearNetworkEvents: () => void
}

export function evaluateTestRun(steps: FlowStepInfo[], tamperMode: string): { passed: boolean; message: string } {
  const allDone = steps.every(s => s.status === 'done' || (s.status === 'pending' && s.payload && (s.payload as any)._note))
  
  if (tamperMode === 'none') {
    return {
      passed: allDone,
      message: allDone 
        ? 'All steps completed successfully.' 
        : `${steps.filter(s => s.status === 'done').length}/${steps.length} steps passed, ${steps.filter(s => s.status === 'error').length} failed.`
    }
  }

  if (tamperMode === 'signature') {
    const verificationStep = steps.find(s => s.id === 'verification')
    if (verificationStep && verificationStep.status === 'error') {
      return {
        passed: true,
        message: 'Negative Test Passed: Verifier successfully rejected the corrupt signature.'
      }
    }
    if (allDone) {
      return {
        passed: false,
        message: 'Negative Test Failed: Verifier incorrectly accepted the corrupt signature!'
      }
    }
    return {
      passed: false,
      message: 'Negative Test Failed: Flow failed before the verification step could check the signature.'
    }
  }

  if (tamperMode === 'expired') {
    const vpResponseStep = steps.find(s => s.id === 'vp-response')
    if (vpResponseStep && vpResponseStep.status === 'error') {
       const payload = vpResponseStep.payload as any
       if (payload && payload._http_status === 400) {
         return {
           passed: true,
           message: 'Negative Test Passed: Verifier successfully rejected the malformed token at submission (HTTP 400).'
         }
       }
       return {
         passed: true,
         message: 'Negative Test Passed: Verifier rejected the malformed token.'
       }
    }
    if (allDone) {
      return {
         passed: false,
         message: 'Negative Test Failed: Verifier incorrectly accepted the malformed token!'
      }
    }
    return {
      passed: false,
      message: 'Negative Test Failed: Flow failed upstream for an unexpected reason.'
    }
  }

  return { passed: false, message: 'Unknown test condition.' }
}

export const useStore = create<PlaygroundStore>((set, get) => ({
  selectedIssuer: issuers[0] || null,
  selectedWallet: wallets[0] || null,
  selectedVerifier: verifiers[0] || null,
  selectedCredType: issuers[0]?.credentialTypes[0] || null,
  steps: [],
  isRunning: false,
  pausedStep: null,
  oauthUrl: null,
  history: [],
  tamperMode: 'none',
  runTamperMode: 'none',
  selectedStepId: null,
  networkEvents: [],

  _resumeResolver: null as ((code: string) => void) | null,

  selectStep: (id) => set((state) => ({
    selectedStepId: state.selectedStepId === id ? null : id,
  })),

  addNetworkEvent: (event) => set((state) => ({
    networkEvents: [...state.networkEvents, { ...event, timestamp: Date.now() }]
  })),

  clearNetworkEvents: () => set({ networkEvents: [] }),

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
  resumeOAuthFlow: (code: string) => {
    const resolver = (get() as any)._resumeResolver
    if (resolver) {
      resolver(code)
    }
  },
  stopFlow: () => {
    const { isRunning, _resumeResolver } = get() as any
    if (!isRunning) return

    api.abortPendingRequests()

    if (_resumeResolver) {
      _resumeResolver('')
    }

    set({
      isRunning: false,
      pausedStep: null,
      oauthUrl: null,
      _resumeResolver: null,
      steps: get().steps.map(s =>
        s.status === 'running'
          ? { ...s, status: 'error', payload: { _cancelled: true, _note: 'Test stopped by user' }, source: 'live' }
          : s
      ),
    })
  },
  cancelOAuthFlow: () => {
    const { stopFlow } = get()
    stopFlow()
  },

  runFlow: async () => {
    const { selectedIssuer, selectedWallet, selectedVerifier, selectedCredType, tamperMode } = get()
    if (!selectedIssuer || !selectedWallet || !selectedVerifier || !selectedCredType) return

    api.resetAbortController()
    api.resetVpSession()

    fetch('/api/tamper', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tamperMode }),
    }).catch(err => console.error('Failed to sync tamper mode on runFlow:', err))

    set({ isRunning: true, steps: [], pausedStep: null, oauthUrl: null, networkEvents: [], selectedStepId: null, runTamperMode: tamperMode })

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
      'vp-response': () => api.submitVPResponse(selectedVerifier),
      'verification': () => api.verifyPresentation(selectedVerifier),
    }

    let manualWait = false;

    for (let i = 0; i < FLOW_STEPS.length; i++) {
      if (!get().isRunning) return

      const stepId = FLOW_STEPS[i].id

      // mark as running
      set({ steps: get().steps.map((s, idx) =>
        idx === i ? { ...s, status: 'running' } : s
      )})

      try {
        const result = await stepActions[stepId]()
        if (!get().isRunning) return

        set({ steps: get().steps.map((s, idx) =>
          idx === i ? { ...s, status: 'done', payload: result.payload, source: result.source } : s
        )})
        
        // Stop early if manual mode is enabled and we just generated the offer
        if ((selectedWallet.id === 'inji-web-manual' || selectedWallet.id === 'inji-mobile') && stepId === 'credential-offer') {
          // Mark remaining steps as skipped
          set({ steps: get().steps.map((s, idx) =>
            idx > i ? { ...s, status: 'pending', payload: { _note: 'Manual mode: waiting for user to complete flow.' } } : s
          )})
          manualWait = true;
          break;
        }
      } catch (err: unknown) {
        if (!get().isRunning) return

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
          
          if (!code || !get().isRunning) {
            set({
              isRunning: false,
              steps: get().steps.map((s, idx) =>
                idx === i
                  ? { ...s, status: 'error', payload: { _cancelled: true, _note: 'Test stopped by user' }, source: 'live' }
                  : s
              ),
            })
            return
          }

          // Retry the step (assuming the API orchestrator will pick up the code or state)
          // We pass the code to the exchangeToken step. We need to modify stepActions for token-exchange
          if (stepId === 'token-exchange') {
            const result = await api.exchangeToken(get().selectedIssuer!, get().selectedCredType!, code)
            if (!get().isRunning) return

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

    if (!manualWait && get().isRunning) {
      // save to history
      const finalSteps = get().steps
      const evaluation = evaluateTestRun(finalSteps, get().runTamperMode)
      const run: TestRun = {
        id: `run-${Date.now()}`,
        config: {
          issuer: selectedIssuer,
          wallet: selectedWallet,
          verifier: selectedVerifier,
          credentialType: selectedCredType,
          tamperMode: get().runTamperMode,
        },
        steps: finalSteps,
        result: evaluation.passed ? 'pass' : 'fail',
        timestamp: Date.now(),
      }

      set({ isRunning: false, history: [run, ...get().history] })
    } else {
      set({ isRunning: false })
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
      if (!get().isRunning) return
      set({ steps: get().steps.map((s, idx) => {
        if (idx === vpRequestIdx) return { ...s, status: 'done', payload: result.payload, source: result.source }
        if (idx > vpRequestIdx) return { ...s, status: 'pending', payload: { _note: 'Manual mode: waiting for user to verify.' } }
        return s
      })})
    } catch (err: unknown) {
      if (!get().isRunning) return
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
      const result = await api.verifyPresentation(selectedVerifier)
      if (!get().isRunning) return
      const isManual = get().selectedWallet?.id === 'inji-web-manual' || get().selectedWallet?.id === 'inji-mobile'
      set({ steps: get().steps.map((s, idx) => {
        if (idx === verificationIdx) return { ...s, status: 'done', payload: result.payload, source: result.source }
        if (isManual && s.status === 'pending') {
          return { ...s, status: 'done', payload: { ...(typeof s.payload === 'object' ? s.payload : {}), _note: 'Completed via external wallet app' }, source: 'live' }
        }
        return s
      })})
    } catch (err: unknown) {
      if (!get().isRunning) return
      const errObj = err as { stepPayload?: Record<string, unknown>; message?: string }
      const payload = errObj.stepPayload
        ? { _error: errObj.message, ...errObj.stepPayload }
        : { _error: String(err) }
      
      set({ steps: get().steps.map((s, idx) =>
        idx === verificationIdx ? { ...s, status: 'error', payload, source: 'live' } : s
      )})
    }

    const finalSteps = get().steps
    const evaluation = evaluateTestRun(finalSteps, get().tamperMode)
    const run: TestRun = {
      id: `run-${Date.now()}`,
      config: {
        issuer: get().selectedIssuer!,
        wallet: get().selectedWallet!,
        verifier: get().selectedVerifier!,
        credentialType: get().selectedCredType!,
      },
      steps: finalSteps,
      result: evaluation.passed ? 'pass' : 'fail',
      timestamp: Date.now(),
    }

    set({ isRunning: false, history: [run, ...get().history] })
  }
}))
