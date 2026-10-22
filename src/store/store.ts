import { create } from 'zustand'
import * as api from '../services/api'
import type {
  IssuerConfig,
  WalletConfig,
  VerifierConfig,
  CredentialType,
  FlowStepInfo,
  TestRun,
  NetworkEvent,
} from '../types'
import { issuers, wallets, verifiers } from '../config'
import { loadHistory, saveHistory, clearSavedHistory, getBaselineHistory } from './history-data'
import { evaluateTestRun, type EvaluationResult } from './evaluator'
import {
  FLOW_STEPS,
  runFlowExecution,
  continueVerificationExecution,
  checkVerificationResultExecution,
} from './flow-runner'

export { evaluateTestRun, FLOW_STEPS, type EvaluationResult }

export interface PlaygroundStore {
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
  resetToBaseline: () => void
  continueVerification: () => Promise<void>
  checkVerificationResult: () => Promise<void>
  addNetworkEvent: (event: Omit<NetworkEvent, 'timestamp'>) => void
  clearNetworkEvents: () => void
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
  history: loadHistory(),
  tamperMode: 'none',
  runTamperMode: 'none',
  selectedStepId: null,
  networkEvents: [],
  _resumeResolver: null as ((code: string) => void) | null,

  selectStep: (id) =>
    set((state) => ({
      selectedStepId: state.selectedStepId === id ? null : id,
    })),

  addNetworkEvent: (event) =>
    set((state) => ({
      networkEvents: [...state.networkEvents, { ...event, timestamp: Date.now() }],
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
    }).catch((err) => console.error('Failed to sync tamper mode:', err))
  },

  clearHistory: () => {
    clearSavedHistory()
    set({ history: [] })
  },

  resetToBaseline: () => {
    const baseline = getBaselineHistory()
    saveHistory(baseline)
    set({ history: baseline })
  },

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
      steps: get().steps.map((s) =>
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

  runFlow: () => runFlowExecution(get, set),
  continueVerification: () => continueVerificationExecution(get, set),
  checkVerificationResult: () => checkVerificationResultExecution(get, set),
}))
