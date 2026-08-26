import { useState } from 'react'
import { issuers, wallets, verifiers } from './config'
import type { IssuerConfig, WalletConfig, VerifierConfig, CredentialType, FlowStepInfo, StepStatus } from './types'

const FLOW_STEPS: { id: FlowStepInfo['id']; label: string }[] = [
  { id: 'credential-offer', label: 'Credential Offer' },
  { id: 'token-exchange', label: 'Token Exchange' },
  { id: 'credential-issuance', label: 'Credential Issuance' },
  { id: 'vp-request', label: 'VP Authorization Request' },
  { id: 'vp-response', label: 'VP Token Response' },
  { id: 'verification', label: 'Verification Result' },
]

function stepStatusLabel(status: StepStatus) {
  switch (status) {
    case 'pending': return '○'
    case 'running': return '◌'
    case 'done': return '✓'
    case 'error': return '✗'
  }
}

function stepStatusColor(status: StepStatus) {
  switch (status) {
    case 'pending': return 'text-slate-600'
    case 'running': return 'text-blue-400'
    case 'done': return 'text-green-400'
    case 'error': return 'text-red-400'
  }
}

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

  async function runFlow() {
    if (!selectedIssuer || !selectedWallet || !selectedVerifier || !selectedCredType) return

    setIsRunning(true)

    // initialize all steps as pending
    const initial: FlowStepInfo[] = FLOW_STEPS.map(s => ({
      ...s,
      status: 'pending' as StepStatus,
    }))
    setSteps(initial)

    // walk through each step with a delay
    for (let i = 0; i < FLOW_STEPS.length; i++) {
      // mark current step as running
      setSteps(prev => prev.map((s, idx) =>
        idx === i ? { ...s, status: 'running' } : s
      ))

      // simulate work
      await new Promise(r => setTimeout(r, 800 + Math.random() * 400))

      // mark as done
      setSteps(prev => prev.map((s, idx) =>
        idx === i ? { ...s, status: 'done' } : s
      ))
    }

    setIsRunning(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Header */}
      <header className="border-b border-slate-800 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Inji Interoperability Playground</h1>
            <p className="text-sm text-slate-400">Verifiable Credential Lifecycle Testing</p>
          </div>
          <a
            href="https://docs.inji.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-slate-400 hover:text-slate-200"
          >
            Docs ↗
          </a>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-1">Test Configuration</h2>
          <p className="text-sm text-slate-400">
            Select an issuer, wallet, and verifier to run a credential lifecycle test.
          </p>
        </div>

        {/* 3 column selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">

          {/* Issuer column */}
          <div className="border border-slate-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Issuer</h3>
            <div className="space-y-2">
              {issuers.map((issuer) => (
                <button
                  key={issuer.id}
                  onClick={() => handleIssuerSelect(issuer)}
                  className={`w-full text-left px-3 py-2.5 rounded-md text-sm border transition-colors ${
                    selectedIssuer?.id === issuer.id
                      ? 'border-blue-500 bg-blue-500/10 text-white'
                      : 'border-slate-700 hover:border-slate-600 text-slate-300'
                  }`}
                >
                  <div className="font-medium">{issuer.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{issuer.description}</div>
                </button>
              ))}
            </div>

            {selectedIssuer && selectedIssuer.credentialTypes.length > 1 && (
              <div className="mt-3 pt-3 border-t border-slate-800">
                <p className="text-xs text-slate-500 mb-2">Credential Format</p>
                <div className="space-y-1.5">
                  {selectedIssuer.credentialTypes.map((ct) => (
                    <button
                      key={ct.id}
                      onClick={() => setSelectedCredType(ct)}
                      className={`w-full text-left px-3 py-2 rounded-md text-xs border transition-colors ${
                        selectedCredType?.id === ct.id
                          ? 'border-blue-500 bg-blue-500/10 text-white'
                          : 'border-slate-700 hover:border-slate-600 text-slate-400'
                      }`}
                    >
                      {ct.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Wallet column */}
          <div className="border border-slate-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Wallet</h3>
            <div className="space-y-2">
              {wallets.map((wallet) => (
                <button
                  key={wallet.id}
                  onClick={() => setSelectedWallet(wallet)}
                  className={`w-full text-left px-3 py-2.5 rounded-md text-sm border transition-colors ${
                    selectedWallet?.id === wallet.id
                      ? 'border-blue-500 bg-blue-500/10 text-white'
                      : 'border-slate-700 hover:border-slate-600 text-slate-300'
                  }`}
                >
                  <div className="font-medium">{wallet.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{wallet.description}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Verifier column */}
          <div className="border border-slate-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Verifier</h3>
            <div className="space-y-2">
              {verifiers.map((verifier) => (
                <button
                  key={verifier.id}
                  onClick={() => setSelectedVerifier(verifier)}
                  className={`w-full text-left px-3 py-2.5 rounded-md text-sm border transition-colors ${
                    selectedVerifier?.id === verifier.id
                      ? 'border-blue-500 bg-blue-500/10 text-white'
                      : 'border-slate-700 hover:border-slate-600 text-slate-300'
                  }`}
                >
                  <div className="font-medium">{verifier.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{verifier.description}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Summary + run button */}
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

        {/* Flow steps */}
        {steps.length > 0 && (
          <div className="border border-slate-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-4">Flow Progress</h3>
            <div className="space-y-2">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm ${
                    step.status === 'running' ? 'bg-slate-800/50' : ''
                  }`}
                >
                  <span className={`font-mono text-base ${stepStatusColor(step.status)}`}>
                    {stepStatusLabel(step.status)}
                  </span>
                  <span className={
                    step.status === 'done' ? 'text-slate-300' :
                    step.status === 'running' ? 'text-white' :
                    'text-slate-500'
                  }>
                    {step.label}
                  </span>
                  {step.status === 'running' && (
                    <span className="text-xs text-blue-400 ml-auto">in progress</span>
                  )}
                </div>
              ))}
            </div>

            {/* Done message */}
            {!isRunning && steps.length > 0 && steps.every(s => s.status === 'done') && (
              <div className="mt-4 pt-3 border-t border-slate-800 text-sm text-green-400">
                All steps completed successfully
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

export default App
