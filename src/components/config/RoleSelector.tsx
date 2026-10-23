import { issuers, wallets, verifiers } from '../../config'
import { useStore } from '../../store/index'

export default function RoleSelector() {
  const {
    selectedIssuer, selectedWallet, selectedVerifier, selectedCredType,
    selectIssuer, selectWallet, selectVerifier, selectCredType,
    isTestActive,
  } = useStore()

  const EnvBadge = ({ env }: { env?: string }) => {
    if (!env) return null
    const colors = {
      local: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      mock: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
      collab: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      external: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30',
    }
    const colorClass = colors[env as keyof typeof colors] || ''
    return (
      <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider border rounded ${colorClass}`}>
        {env}
      </span>
    )
  }

  const getCardClass = (isSelected: boolean) => {
    if (isTestActive) {
      return isSelected
        ? 'border-blue-500/80 bg-blue-500/10 text-white cursor-not-allowed opacity-90'
        : 'border-slate-800/60 bg-slate-900/20 text-slate-500 cursor-not-allowed opacity-40'
    }
    return isSelected
      ? 'border-blue-500 bg-blue-500/10 text-white cursor-pointer'
      : 'border-slate-700 hover:border-slate-600 text-slate-300 cursor-pointer'
  }

  const getCredFormatClass = (isSelected: boolean) => {
    if (isTestActive) {
      return isSelected
        ? 'border-blue-500/80 bg-blue-500/10 text-white cursor-not-allowed opacity-90'
        : 'border-slate-800/60 text-slate-600 cursor-not-allowed opacity-40'
    }
    return isSelected
      ? 'border-blue-500 bg-blue-500/10 text-white cursor-pointer'
      : 'border-slate-700 hover:border-slate-600 text-slate-400 cursor-pointer'
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Issuer */}
        <div className={`border rounded-lg p-4 transition-colors ${isTestActive ? 'border-slate-800/80 bg-slate-950/40' : 'border-slate-800'}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-300">Issuer</h3>
          </div>
          <div className="space-y-2">
            {issuers.map((issuer) => (
              <button
                key={issuer.id}
                disabled={isTestActive}
                onClick={() => selectIssuer(issuer)}
                className={`w-full text-left px-3 py-2.5 rounded-md text-sm border transition-colors ${getCardClass(selectedIssuer?.id === issuer.id)}`}
              >
                <div className="font-medium flex items-center">
                  {issuer.name}
                  <EnvBadge env={issuer.env} />
                </div>
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
                    disabled={isTestActive}
                    onClick={() => selectCredType(ct)}
                    className={`w-full text-left px-3 py-2 rounded-md text-xs border transition-colors ${getCredFormatClass(selectedCredType?.id === ct.id)}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{ct.name}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono uppercase ${
                        ct.format === 'vc+sd-jwt'
                          ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          : ct.format === 'mso_mdoc'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}>
                        {ct.format}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 font-mono">
                      {ct.proofTypes.join(', ')}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Wallet */}
        <div className={`border rounded-lg p-4 transition-colors ${isTestActive ? 'border-slate-800/80 bg-slate-950/40' : 'border-slate-800'}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-300">Wallet</h3>
          </div>
          <div className="space-y-2">
            {wallets.map((wallet) => (
              <button
                key={wallet.id}
                disabled={isTestActive}
                onClick={() => selectWallet(wallet)}
                className={`w-full text-left px-3 py-2.5 rounded-md text-sm border transition-colors ${getCardClass(selectedWallet?.id === wallet.id)}`}
              >
                <div className="font-medium flex items-center">
                  {wallet.name}
                  <EnvBadge env={wallet.env} />
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{wallet.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Verifier */}
        <div className={`border rounded-lg p-4 transition-colors ${isTestActive ? 'border-slate-800/80 bg-slate-950/40' : 'border-slate-800'}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-slate-300">Verifier</h3>
          </div>
          <div className="space-y-2">
            {verifiers.map((verifier) => (
              <button
                key={verifier.id}
                disabled={isTestActive}
                onClick={() => selectVerifier(verifier)}
                className={`w-full text-left px-3 py-2.5 rounded-md text-sm border transition-colors ${getCardClass(selectedVerifier?.id === verifier.id)}`}
              >
                <div className="font-medium flex items-center">
                  {verifier.name}
                  <EnvBadge env={verifier.env} />
                </div>
                <div className="text-xs text-slate-500 mt-0.5">{verifier.description}</div>
                {selectedCredType?.format === 'mso_mdoc' && (
                  verifier.id === 'verify-local' ? (
                    <div className="text-[11px] text-amber-400/90 mt-1.5 flex items-center gap-1.5 font-sans bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded">
                      <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Inji Verify 0.17 lacks mDoc parser (Planned v0.18.0+)</span>
                    </div>
                  ) : verifier.id === 'inji-verify-collab-live' ? (
                    <div className="text-[11px] text-amber-400/90 mt-1.5 flex items-center gap-1.5 font-sans bg-amber-500/10 border border-amber-500/20 px-2 py-1 rounded">
                      <svg className="w-3.5 h-3.5 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                      <span>Collab DCQL does not support mDoc doctype queries</span>
                    </div>
                  ) : null
                )}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
