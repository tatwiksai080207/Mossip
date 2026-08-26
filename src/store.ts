import { create } from 'zustand'
import * as mock from './mock-payloads'
import type { IssuerConfig, WalletConfig, VerifierConfig, CredentialType, FlowStepInfo, StepStatus, TestRun } from './types'

const FLOW_STEPS: { id: FlowStepInfo['id']; label: string }[] = [
  { id: 'credential-offer', label: 'Credential Offer' },
  { id: 'token-exchange', label: 'Token Exchange' },
  { id: 'credential-issuance', label: 'Credential Issuance' },
  { id: 'vp-request', label: 'VP Authorization Request' },
  { id: 'vp-response', label: 'VP Token Response' },
  { id: 'verification', label: 'Verification Result' },
]

interface PlaygroundStore {
  // selections
  selectedIssuer: IssuerConfig | null
  selectedWallet: WalletConfig | null
  selectedVerifier: VerifierConfig | null
  selectedCredType: CredentialType | null

  // flow state
  steps: FlowStepInfo[]
  isRunning: boolean

  // history
  history: TestRun[]

  // actions
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

    for (let i = 0; i < FLOW_STEPS.length; i++) {
      set({ steps: get().steps.map((s, idx) =>
        idx === i ? { ...s, status: 'running' } : s
      )})

      await new Promise(r => setTimeout(r, 800 + Math.random() * 400))

      const stepId = FLOW_STEPS[i].id
      let payload: unknown = null
      switch (stepId) {
        case 'credential-offer': payload = mock.credentialOffer(selectedIssuer, selectedCredType); break
        case 'token-exchange': payload = mock.tokenResponse(); break
        case 'credential-issuance': payload = mock.issuedCredential(selectedCredType); break
        case 'vp-request': payload = mock.vpAuthorizationRequest(selectedCredType); break
        case 'vp-response': payload = mock.vpTokenResponse(selectedCredType); break
        case 'verification': payload = mock.verificationResult(); break
      }

      set({ steps: get().steps.map((s, idx) =>
        idx === i ? { ...s, status: 'done', payload } : s
      )})
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
