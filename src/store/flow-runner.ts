import * as api from '../services/api'
import type { FlowStepInfo, StepStatus, TestRun } from '../types'
import { saveHistory } from './history-data'
import { evaluateTestRun } from './evaluator'
import type { PlaygroundStore } from './store'

export const FLOW_STEPS: { id: FlowStepInfo['id']; label: string }[] = [
  { id: 'issuer-metadata', label: 'Issuer Metadata Discovery' },
  { id: 'credential-offer', label: 'Credential Offer' },
  { id: 'token-exchange', label: 'Token Exchange' },
  { id: 'credential-issuance', label: 'Credential Issuance' },
  { id: 'vp-request', label: 'VP Authorization Request' },
  { id: 'vp-response', label: 'VP Token Response' },
  { id: 'verification', label: 'Verification Result' },
]

export type StoreGet = () => PlaygroundStore
export type StoreSet = (
  partial: Partial<PlaygroundStore> | ((state: PlaygroundStore) => Partial<PlaygroundStore>)
) => void

export async function runFlowExecution(get: StoreGet, set: StoreSet): Promise<void> {
  const { selectedIssuer, selectedWallet, selectedVerifier, selectedCredType, tamperMode } = get()
  if (!selectedIssuer || !selectedWallet || !selectedVerifier || !selectedCredType) return

  api.resetAbortController()
  api.resetVpSession()

  fetch('/api/tamper', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tamperMode }),
  }).catch(err => console.error('Failed to sync tamper mode on runFlow:', err))

  const startTime = Date.now()
  set({
    isRunning: true,
    isTestActive: true,
    isStepBusy: true,
    sessionStatus: 'executing',
    steps: [],
    pausedStep: null,
    oauthUrl: null,
    networkEvents: [],
    selectedStepId: null,
    runTamperMode: tamperMode,
  })

  const initial: FlowStepInfo[] = FLOW_STEPS.map(s => ({
    ...s,
    status: 'pending' as StepStatus,
  }))
  set({ steps: initial })

  const stepActions: Record<string, () => Promise<{ payload: unknown; source: 'live' | 'mock' }>> = {
    'issuer-metadata': () => api.fetchIssuerMetadata(selectedIssuer),
    'credential-offer': () => api.createCredentialOffer(selectedIssuer, selectedCredType),
    'token-exchange': () => api.exchangeToken(selectedIssuer, selectedCredType),
    'credential-issuance': () => api.requestCredential(selectedIssuer, selectedCredType),
    'vp-request': () => api.createVPRequest(selectedCredType, selectedVerifier),
    'vp-response': () => api.submitVPResponse(selectedVerifier),
    verification: () => api.verifyPresentation(selectedVerifier),
  }

  let manualWait = false

  for (let i = 0; i < FLOW_STEPS.length; i++) {
    if (!get().isTestActive) return

    const stepId = FLOW_STEPS[i].id

    set(state => ({
      steps: state.steps.map((s, idx) => (idx === i ? { ...s, status: 'running' } : s)),
    }))

    try {
      const result = await stepActions[stepId]()
      if (!get().isTestActive) return

      set(state => ({
        steps: state.steps.map((s, idx) =>
          idx === i ? { ...s, status: 'done', payload: result.payload, source: result.source } : s
        ),
      }))

      if (
        (selectedWallet.id === 'inji-wallet-interactive' || selectedWallet.id === 'inji-web-manual' || selectedWallet.id === 'inji-mobile') &&
        stepId === 'credential-offer'
      ) {
        set(state => ({
          steps: state.steps.map((s, idx) =>
            idx > i
              ? { ...s, status: 'pending', payload: { _note: 'Manual mode: waiting for user to complete flow.' } }
              : s
          ),
          isRunning: false,
          isStepBusy: false,
          sessionStatus: 'waiting_for_wallet',
          isTestActive: true,
        }))
        manualWait = true
        break
      }
    } catch (err: unknown) {
      if (!get().isTestActive) return

      const errObj = err as { stepPayload?: Record<string, unknown>; message?: string; oauthUrl?: string }

      if (errObj.message === 'OAuthPauseRequired' && errObj.oauthUrl) {
        set(state => ({
          pausedStep: stepId,
          oauthUrl: errObj.oauthUrl,
          steps: state.steps.map((s, idx) => (idx === i ? { ...s, status: 'running' } : s)),
        }))

        const code = await new Promise<string>(resolve => {
          set({ _resumeResolver: resolve } as Partial<PlaygroundStore>)
        })

        set({ pausedStep: null, oauthUrl: null, _resumeResolver: null } as Partial<PlaygroundStore>)

        if (!code || !get().isTestActive) {
          set(state => ({
            isRunning: false,
            isTestActive: false,
            isStepBusy: false,
            sessionStatus: 'aborted',
            steps: state.steps.map((s, idx) =>
              idx === i
                ? {
                    ...s,
                    status: 'error',
                    payload: { _cancelled: true, _note: 'Test stopped by user' },
                    source: 'live',
                  }
                : s
            ),
          }))
          return
        }

        if (stepId === 'token-exchange') {
          const result = await api.exchangeToken(get().selectedIssuer!, get().selectedCredType!, code)
          if (!get().isTestActive) return

          set(state => ({
            steps: state.steps.map((s, idx) =>
              idx === i ? { ...s, status: 'done', payload: result.payload, source: result.source } : s
            ),
          }))
        }
        continue
      }

      const payload = errObj.stepPayload
        ? { _error: errObj.message, ...errObj.stepPayload }
        : { _error: String(err) }
      set(state => ({
        steps: state.steps.map((s, idx) => (idx === i ? { ...s, status: 'error', payload, source: 'live' } : s)),
        isRunning: false,
        isTestActive: false,
        isStepBusy: false,
        sessionStatus: 'failed',
      }))
      return
    }
  }

  if (!manualWait && get().isTestActive) {
    const finalSteps = get().steps
    const evaluation = evaluateTestRun(finalSteps, get().runTamperMode)
    const run: TestRun = {
      id: `run-${Date.now()}`,
      version: 'v0.17.0 (Live)',
      durationMs: Date.now() - startTime,
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

    const newHistory = [run, ...get().history]
    saveHistory(newHistory)
    set({
      isRunning: false,
      isTestActive: false,
      isStepBusy: false,
      sessionStatus: evaluation.passed ? 'completed' : 'failed',
      history: newHistory,
    })
  }
}

export async function continueVerificationExecution(get: StoreGet, set: StoreSet): Promise<void> {
  const { steps, selectedCredType, selectedVerifier, tamperMode } = get()
  if (!selectedCredType || !selectedVerifier) return

  fetch('/api/tamper', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tamperMode }),
  }).catch(err => console.error('Failed to sync tamper mode on continueVerification:', err))

  set({ isRunning: true, isStepBusy: true, isTestActive: true, sessionStatus: 'executing' })

  const vpRequestIdx = steps.findIndex(s => s.id === 'vp-request')
  if (vpRequestIdx === -1) return

  set(state => ({
    steps: state.steps.map((s, idx) => (idx === vpRequestIdx ? { ...s, status: 'running' } : s)),
  }))

  try {
    const result = await api.createVPRequest(selectedCredType, selectedVerifier)
    if (!get().isTestActive) return
    set(state => ({
      steps: state.steps.map((s, idx) => {
        if (idx === vpRequestIdx) return { ...s, status: 'done', payload: result.payload, source: result.source }
        if (idx > vpRequestIdx)
          return { ...s, status: 'pending', payload: { _note: 'Manual mode: waiting for user to verify.' } }
        return s
      }) as FlowStepInfo[],
      isRunning: false,
      isStepBusy: false,
      isTestActive: true,
      sessionStatus: 'waiting_for_wallet',
    }))
  } catch (err: unknown) {
    if (!get().isTestActive) return
    const errObj = err as { stepPayload?: Record<string, unknown>; message?: string }
    const payload = errObj.stepPayload ? { _error: errObj.message, ...errObj.stepPayload } : { _error: String(err) }

    set(state => ({
      steps: state.steps.map((s, idx) =>
        idx === vpRequestIdx ? { ...s, status: 'error', payload, source: 'live' } : s
      ),
      isRunning: false,
      isStepBusy: false,
      isTestActive: false,
      sessionStatus: 'failed',
    }))
  }
}

export async function checkVerificationResultExecution(get: StoreGet, set: StoreSet): Promise<void> {
  const { steps, selectedVerifier } = get()
  if (!selectedVerifier) return

  set({ isRunning: true, isStepBusy: true, isTestActive: true, sessionStatus: 'executing' })

  const verificationIdx = steps.findIndex(s => s.id === 'verification')
  if (verificationIdx === -1) return

  set(state => ({
    steps: state.steps.map((s, idx) => (idx === verificationIdx ? { ...s, status: 'running' } : s)),
  }))

  try {
    const result = await api.verifyPresentation(selectedVerifier)
    if (!get().isTestActive) return
    const isManual = get().selectedWallet?.id === 'inji-wallet-interactive' || get().selectedWallet?.id === 'inji-web-manual' || get().selectedWallet?.id === 'inji-mobile'
    set(state => ({
      steps: state.steps.map((s, idx) => {
        if (idx === verificationIdx) return { ...s, status: 'done', payload: result.payload, source: result.source }
        if (isManual && s.status === 'pending') {
          return {
            ...s,
            status: 'done',
            payload: {
              ...(typeof s.payload === 'object' ? s.payload : {}),
              _note: 'Completed via external wallet app',
            },
            source: 'live',
          }
        }
        return s
      }) as FlowStepInfo[],
    }))

    const finalSteps = get().steps
    const evaluation = evaluateTestRun(finalSteps, get().tamperMode)
    const run: TestRun = {
      id: `run-${Date.now()}`,
      version: 'v0.17.0 (Live)',
      durationMs: 1400,
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

    const newHistory = [run, ...get().history]
    saveHistory(newHistory)
    set({
      isRunning: false,
      isStepBusy: false,
      isTestActive: false,
      sessionStatus: evaluation.passed ? 'completed' : 'failed',
      history: newHistory,
    })
  } catch (err: unknown) {
    if (!get().isTestActive) return
    const errObj = err as { stepPayload?: Record<string, unknown>; message?: string }
    const payload = errObj.stepPayload ? { _error: errObj.message, ...errObj.stepPayload } : { _error: String(err) }

    set(state => ({
      steps: state.steps.map((s, idx) =>
        idx === verificationIdx ? { ...s, status: 'error', payload, source: 'live' } : s
      ),
      isRunning: false,
      isStepBusy: false,
      isTestActive: false,
      sessionStatus: 'failed',
    }))
  }
}
