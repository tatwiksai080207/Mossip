import { useState } from 'react'
import Header from './components/Header'
import RoleSelector from './components/RoleSelector'
import FlowProgress from './components/FlowProgress'
import * as mock from './mock-payloads'
import type { IssuerConfig, WalletConfig, VerifierConfig, CredentialType, FlowStepInfo, StepStatus } from './types'

const FLOW_STEPS: { id: FlowStepInfo['id']; label: string }[] = [
  { id: 'credential-offer', label: 'Credential Offer' },
  { id: 'token-exchange', label: 'Token Exchange' },
  { id: 'credential-issuance', label: 'Credential Issuance' },
  { id: 'vp-request', label: 'VP Authorization Request' },
  { id: 'vp-response', label: 'VP Token Response' },
  { id: 'verification', label: 'Verification Result' },
]

function App() {
  const [selectedIssuer, setSelectedIssuer] = useState<IssuerConfig | null>(null)
  const [selectedWallet, setSelectedWallet] = useState<WalletConfig | null>(null)
  const [selectedVerifier, setSelectedVerifier] = useState<VerifierConfig | null>(null)
  const [selectedCredType, setSelectedCredType] = useState<CredentialType | null>(null)
  const [steps, setSteps] = useState<FlowStepInfo[]>([])
  const [isRunning, setIsRunning] = useState(false)

  const canRun = selectedIssuer && selectedWallet && selectedVerifier && selectedCredType && !isRunning

  function handleIssuerSelect(issuer: IssuerConfig) {
    setSelectedIssuer(issuer)
    setSelectedCredType(issuer.credentialTypes[0] || null)
  }

  function getPayload(stepId: string) {
    if (!selectedCredType || !selectedIssuer) return null
    switch (stepId) {
      case 'credential-offer': return mock.credentialOffer(selectedIssuer, selectedCredType)
      case 'token-exchange': return mock.tokenResponse()
      case 'credential-issuance': return mock.issuedCredential(selectedCredType)
      case 'vp-request': return mock.vpAuthorizationRequest(selectedCredType)
      case 'vp-response': return mock.vpTokenResponse(selectedCredType)
      case 'verification': return mock.verificationResult()
      default: return null
    }
  }

  async function runFlow() {
    if (!canRun) return
    setIsRunning(true)

    const initial: FlowStepInfo[] = FLOW_STEPS.map(s => ({
      ...s, status: 'pending' as StepStatus,
    }))
    setSteps(initial)

    for (let i = 0; i < FLOW_STEPS.length; i++) {
      setSteps(prev => prev.map((s, idx) =>
        idx === i ? { ...s, status: 'running' } : s
      ))
      await new Promise(r => setTimeout(r, 800 + Math.random() * 400))
      setSteps(prev => prev.map((s, idx) =>
        idx === i ? { ...s, status: 'done', payload: getPayload(FLOW_STEPS[i].id) } : s
      ))
    }

    setIsRunning(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Header />

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-1">Test Configuration</h2>
          <p className="text-sm text-slate-400">
            Select an issuer, wallet, and verifier to run a credential lifecycle test.
          </p>
        </div>

        <div className="mb-8">
          <RoleSelector
            selectedIssuer={selectedIssuer}
            selectedWallet={selectedWallet}
            selectedVerifier={selectedVerifier}
            selectedCredType={selectedCredType}
            onIssuerSelect={handleIssuerSelect}
            onWalletSelect={setSelectedWallet}
            onVerifierSelect={setSelectedVerifier}
            onCredTypeSelect={setSelectedCredType}
          />
        </div>

        {/* Summary + run */}
        <div className="flex items-center justify-between border border-slate-800 rounded-lg px-4 py-3 mb-8">
          <div className="text-sm text-slate-400">
            {selectedIssuer?.name || '—'} → {selectedWallet?.name || '—'} → {selectedVerifier?.name || '—'}
            {selectedCredType && (
              <span className="ml-2 text-xs text-slate-500">({selectedCredType.name})</span>
            )}
          </div>
          <button
            disabled={!canRun}
            onClick={runFlow}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              canRun
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            {isRunning ? 'Running...' : 'Run Test'}
          </button>
        </div>

        <FlowProgress steps={steps} isRunning={isRunning} />
      </main>
    </div>
  )
}

export default App
