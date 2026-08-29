import Header from './components/Header'
import RoleSelector from './components/RoleSelector'
import FlowProgress from './components/FlowProgress'
import TestReport from './components/TestReport'
import RunHistory from './components/RunHistory'
import SequenceDiagram from './components/SequenceDiagram'
import InjiVerifyPanel from './components/InjiVerifyPanel'
import InteropMatrix from './components/InteropMatrix'
import { useStore } from './store'

function App() {
  const {
    selectedIssuer, selectedWallet, selectedVerifier, selectedCredType,
    steps, isRunning, runFlow,
  } = useStore()

  const canRun = selectedIssuer && selectedWallet && selectedVerifier && selectedCredType && !isRunning
  const flowHasRun = !isRunning && steps.length > 0 && steps.every(s => s.status !== 'pending' && s.status !== 'running')

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

        {steps.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FlowProgress />
            <SequenceDiagram />
          </div>
        ) : (
          <FlowProgress />
        )}

        {flowHasRun && steps.some(s => s.id === 'credential-issuance' && s.status === 'error') && (
          <div className="mt-4 border border-amber-500/30 bg-amber-500/5 rounded-lg px-4 py-3 flex gap-3">
            <span className="text-amber-400 text-lg leading-none mt-0.5">⚠</span>
            <div>
              <p className="text-sm font-medium text-amber-300">Interoperability Gap Discovered</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Step 4 (Credential Issuance) requires an OAuth access token from eSignet, which mandates
                an interactive login with a dynamic email OTP. Automated &amp; headless issuance is not
                supported by the Collab sandbox. Steps 1–3 completed with live data. Steps 5–7 continue
                with mock data to demonstrate the full protocol flow.{' '}
                <a href="https://github.com" className="text-amber-400 underline" target="_blank" rel="noopener noreferrer">
                  See INTEROPERABILITY_REPORT.md
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Inji Verify SDK - OpenID4VP QR verification */}
        {flowHasRun && (
          <div className="mt-6">
            <InjiVerifyPanel />
          </div>
        )}

        {flowHasRun && selectedIssuer && selectedWallet && selectedVerifier && selectedCredType && (
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

        <div className="mt-6">
          <InteropMatrix />
        </div>
      </main>
    </div>
  )
}

export default App
