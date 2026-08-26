import './index.css'

function App() {
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

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-1">Test Configuration</h2>
          <p className="text-sm text-slate-400">
            Select an issuer, wallet, and verifier to run a credential lifecycle test.
          </p>
        </div>

        {/* 3 column selector */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* Issuer */}
          <div className="border border-slate-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Issuer</h3>
            <p className="text-xs text-slate-500">Select who issues the credential</p>
          </div>

          {/* Wallet */}
          <div className="border border-slate-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Wallet</h3>
            <p className="text-xs text-slate-500">Select who holds the credential</p>
          </div>

          {/* Verifier */}
          <div className="border border-slate-800 rounded-lg p-4">
            <h3 className="text-sm font-medium text-slate-300 mb-3">Verifier</h3>
            <p className="text-xs text-slate-500">Select who verifies the credential</p>
          </div>
        </div>

        {/* Run button */}
        <div className="flex justify-center">
          <button
            disabled
            className="px-5 py-2.5 bg-slate-800 text-slate-500 rounded-lg text-sm font-medium cursor-not-allowed"
          >
            Run Interoperability Test
          </button>
        </div>
      </main>
    </div>
  )
}

export default App
