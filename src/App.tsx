import Header from './components/Header'
import RoleSelector from './components/RoleSelector'
import FlowProgress from './components/FlowProgress'
import TestReport from './components/TestReport'
import RunHistory from './components/RunHistory'
import { useStore } from './store'

function App() {
  const {
    selectedIssuer, selectedWallet, selectedVerifier, selectedCredType,
    steps, isRunning, runFlow,
  } = useStore()

  const canRun = selectedIssuer && selectedWallet && selectedVerifier && selectedCredType && !isRunning
  const flowDone = !isRunning && steps.length > 0 && steps.every(s => s.status === 'done')

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
          <RoleSelector />
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

        <FlowProgress />

        {flowDone && selectedIssuer && selectedWallet && selectedVerifier && selectedCredType && (
          <div className="mt-6">
            <TestReport
              issuer={selectedIssuer}
              wallet={selectedWallet}
              verifier={selectedVerifier}
              credentialType={selectedCredType}
              steps={steps}
            />
          </div>
        )}

        <div className="mt-6">
          <RunHistory />
        </div>
      </main>
    </div>
  )
}

export default App
