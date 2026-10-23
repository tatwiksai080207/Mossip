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
  TestSessionStatus,
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
  isTestActive: boolean
  isStepBusy: boolean
  sessionStatus: TestSessionStatus
  pausedStep: FlowStepInfo['id'] | null
  oauthUrl: string | null
  history: TestRun[]
  tamperMode: 'none' | 'signature' | 'expired'
  runTamperMode: 'none' | 'signature' | 'expired'
  selectedStepId: FlowStepInfo['id'] | null
  networkEvents: NetworkEvent[]
  _resumeResolver?: ((code: string) => void) | null

  localGrantType: 'pre-authorized_code' | 'authorization_code'
  setLocalGrantType: (grant: 'pre-authorized_code' | 'authorization_code') => void
  selectIssuer: (issuer: IssuerConfig) => void
  selectWallet: (wallet: WalletConfig) => void
  selectVerifier: (verifier: VerifierConfig) => void
  selectCredType: (ct: CredentialType) => void
  setTamperMode: (mode: 'none' | 'signature' | 'expired') => void
  selectStep: (id: FlowStepInfo['id'] | null) => void
  runFlow: () => Promise<void>
  stopFlow: () => void
  abortTest: () => void
  resetTest: () => void
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
  isTestActive: false,
  isStepBusy: false,
  sessionStatus: 'idle',
  pausedStep: null,
  oauthUrl: null,
  history: loadHistory(),
  tamperMode: 'none',
  runTamperMode: 'none',
  selectedStepId: null,
  networkEvents: [],
  _resumeResolver: null as ((code: string) => void) | null,
  localGrantType: 'pre-authorized_code',
  setLocalGrantType: (grant) => set({ localGrantType: grant }),

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
    if (get().isTestActive) return
    set({
      selectedIssuer: issuer,
      selectedCredType: issuer.credentialTypes[0] || null,
    })
  },

  selectWallet: (wallet) => {
    if (get().isTestActive) return
    set({ selectedWallet: wallet })
  },
  selectVerifier: (verifier) => {
    if (get().isTestActive) return
    set({ selectedVerifier: verifier })
  },
  selectCredType: (ct) => {
    if (get().isTestActive) return
    set({ selectedCredType: ct })
  },

  setTamperMode: (mode) => {
    if (get().isTestActive) return
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

  abortTest: () => {
    const { isTestActive, _resumeResolver } = get() as any
    if (!isTestActive && !get().isRunning) return

    api.abortPendingRequests()

    if (_resumeResolver) {
      _resumeResolver('')
    }

    const firstPendingIdx = get().steps.findIndex((s) => s.status === 'pending')
    const updatedSteps = get().steps.map((s, idx) => {
      if (s.status === 'running' || (firstPendingIdx !== -1 && idx === firstPendingIdx)) {
        return {
          ...s,
          status: 'error' as const,
          payload: { _cancelled: true, _note: 'Test aborted by user' },
          source: 'live' as const,
        }
      }
      return s
    })

    set({
      isRunning: false,
      isTestActive: false,
      isStepBusy: false,
      sessionStatus: 'aborted',
      pausedStep: null,
      oauthUrl: null,
      _resumeResolver: null,
      steps: updatedSteps,
    })
  },

  stopFlow: () => {
    get().abortTest()
  },

  resetTest: () => {
    if (get().isTestActive) return
    set({
      steps: [],
      sessionStatus: 'idle',
      selectedStepId: null,
      networkEvents: [],
      pausedStep: null,
      oauthUrl: null,
    })
  },

  cancelOAuthFlow: () => {
    get().abortTest()
  },

  runFlow: () => runFlowExecution(get, set),
  continueVerification: () => continueVerificationExecution(get, set),
  checkVerificationResult: () => checkVerificationResultExecution(get, set),
}))
