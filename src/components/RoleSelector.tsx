import { issuers, wallets, verifiers } from '../config'
import { useStore } from '../store'

export default function RoleSelector() {
  const {
    selectedIssuer, selectedWallet, selectedVerifier, selectedCredType,
    selectIssuer, selectWallet, selectVerifier, selectCredType,
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

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Issuer */}
      <div className="border border-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Issuer</h3>
        <div className="space-y-2">
          {issuers.map((issuer) => (
            <button
              key={issuer.id}
              onClick={() => selectIssuer(issuer)}
              className={`w-full text-left px-3 py-2.5 rounded-md text-sm border transition-colors ${
                selectedIssuer?.id === issuer.id
                  ? 'border-blue-500 bg-blue-500/10 text-white'
                  : 'border-slate-700 hover:border-slate-600 text-slate-300'
              }`}
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
                  onClick={() => selectCredType(ct)}
                  className={`w-full text-left px-3 py-2 rounded-md text-xs border transition-colors ${
                    selectedCredType?.id === ct.id
                      ? 'border-blue-500 bg-blue-500/10 text-white'
                      : 'border-slate-700 hover:border-slate-600 text-slate-400'
                  }`}
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
      <div className="border border-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Wallet</h3>
        <div className="space-y-2">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => selectWallet(wallet)}
              className={`w-full text-left px-3 py-2.5 rounded-md text-sm border transition-colors ${
                selectedWallet?.id === wallet.id
                  ? 'border-blue-500 bg-blue-500/10 text-white'
                  : 'border-slate-700 hover:border-slate-600 text-slate-300'
              }`}
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
      <div className="border border-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Verifier</h3>
        <div className="space-y-2">
          {verifiers.map((verifier) => (
            <button
              key={verifier.id}
              onClick={() => selectVerifier(verifier)}
              className={`w-full text-left px-3 py-2.5 rounded-md text-sm border transition-colors ${
                selectedVerifier?.id === verifier.id
                  ? 'border-blue-500 bg-blue-500/10 text-white'
                  : 'border-slate-700 hover:border-slate-600 text-slate-300'
              }`}
            >
              <div className="font-medium flex items-center">
                {verifier.name}
                <EnvBadge env={verifier.env} />
              </div>
              <div className="text-xs text-slate-500 mt-0.5">{verifier.description}</div>
              {selectedCredType?.format === 'mso_mdoc' && verifier.env === 'collab' && (
                <div className="text-[11px] text-amber-400/90 mt-1 flex items-center gap-1 font-sans">
                  <span>⚠️</span>
                  <span>Collab DCQL only supports ldp_vc & sd-jwt. Use Local Verify or walt.id for mDoc.</span>
                </div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
