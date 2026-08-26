import { useState } from 'react'
import { issuers, wallets, verifiers } from './config'
import type { IssuerConfig, WalletConfig, VerifierConfig, CredentialType } from './types'

function App() {
  const [selectedIssuer, setSelectedIssuer] = useState<IssuerConfig | null>(null)
  const [selectedWallet, setSelectedWallet] = useState<WalletConfig | null>(null)
  const [selectedVerifier, setSelectedVerifier] = useState<VerifierConfig | null>(null)
  const [selectedCredType, setSelectedCredType] = useState<CredentialType | null>(null)

  const canRun = selectedIssuer && selectedWallet && selectedVerifier && selectedCredType

  function handleIssuerSelect(issuer: IssuerConfig) {
    setSelectedIssuer(issuer)
    // auto-select first credential type
    setSelectedCredType(issuer.credentialTypes[0] || null)
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

            {/* Credential format sub-selector */}
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
        <div className="flex items-center justify-between border border-slate-800 rounded-lg px-4 py-3">
          <div className="text-sm text-slate-400">
            {selectedIssuer?.name || '—'} → {selectedWallet?.name || '—'} → {selectedVerifier?.name || '—'}
            {selectedCredType && (
              <span className="ml-2 text-xs text-slate-500">({selectedCredType.name})</span>
            )}
          </div>
          <button
            disabled={!canRun}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              canRun
                ? 'bg-blue-600 text-white hover:bg-blue-500'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            Run Test
          </button>
        </div>
      </main>
    </div>
  )
}

export default App
