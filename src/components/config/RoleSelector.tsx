import { issuers, wallets, verifiers } from '../../config'
import { useStore } from '../../store/index'

export default function RoleSelector() {
  const {
    selectedIssuer, selectedWallet, selectedVerifier, selectedCredType,
    selectIssuer, selectWallet, selectVerifier, selectCredType,
    isTestActive,
    localGrantType, setLocalGrantType,
  } = useStore()

  const EnvBadge = ({ env }: { env?: string }) => {
    if (!env) return null
    const colors = {
      local: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
      mock: 'bg-app-card text-app-text-muted border-app-border',
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
        ? 'border-app-border-focus bg-app-card-selected text-app-text cursor-not-allowed opacity-90'
        : 'border-app-border/60 bg-app-card/20 text-app-text-muted cursor-not-allowed opacity-40'
    }
    return isSelected
      ? 'border-app-border-focus bg-app-card-selected text-app-text cursor-pointer'
      : 'border-app-border hover:border-app-border-subtle bg-app-card/40 hover:bg-app-card-hover text-app-text-secondary hover:text-app-text cursor-pointer'
  }

  const getCredFormatClass = (isSelected: boolean) => {
    if (isTestActive) {
      return isSelected
        ? 'border-app-border-focus bg-app-card-selected text-app-text cursor-not-allowed opacity-90'
        : 'border-app-border/60 text-app-text-muted cursor-not-allowed opacity-40'
    }
    return isSelected
      ? 'border-app-border-focus bg-app-card-selected text-app-text cursor-pointer'
      : 'border-app-border hover:border-app-border-subtle bg-app-card/30 hover:bg-app-card-hover text-app-text-secondary hover:text-app-text cursor-pointer'
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Issuer */}
        <div className={`border rounded-lg p-4 transition-colors ${isTestActive ? 'border-app-border/80 bg-app-base/40' : 'border-app-border bg-app-card/30'}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-app-text">Issuer</h3>
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
                <div className="text-xs text-app-text-muted mt-0.5">{issuer.description}</div>
              </button>
            ))}
          </div>
          {selectedIssuer && selectedIssuer.credentialTypes.length > 1 && (
            <div className="mt-3 pt-3 border-t border-app-border">
              <p className="text-xs text-app-text-muted mb-2">Credential Format</p>
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
                          ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}>
                        {ct.format}
                      </span>
                    </div>
                    <div className="text-[11px] text-app-text-muted mt-0.5 font-mono">
                      {ct.proofTypes.join(', ')}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {selectedIssuer?.id === 'certify-local' && (
            <div className="mt-3 pt-3 border-t border-app-border">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-app-text-secondary font-medium flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5 text-app-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  OpenID4VCI Grant Flow
                </p>
                <span className="text-[10px] text-app-text-muted font-mono">Draft 13</span>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  disabled={isTestActive}
                  onClick={() => setLocalGrantType('pre-authorized_code')}
                  className={`px-2.5 py-1.5 rounded text-xs border text-left transition-all ${
                    localGrantType === 'pre-authorized_code'
                      ? 'border-app-border-focus bg-app-card-selected text-app-text shadow-sm'
                      : 'border-app-border bg-app-card/40 text-app-text-muted hover:border-app-border-subtle hover:text-app-text'
                  }`}
                >
                  <div className="font-semibold text-[11px] flex items-center gap-1">
                    Pre-Auth Code
                  </div>
                  <div className="text-[10px] text-app-text-muted opacity-80 mt-0.5">Automated / Kiosk (§4.1)</div>
                </button>
                <button
                  type="button"
                  disabled={isTestActive}
                  onClick={() => setLocalGrantType('authorization_code')}
                  className={`px-2.5 py-1.5 rounded text-xs border text-left transition-all ${
                    localGrantType === 'authorization_code'
                      ? 'border-emerald-500/80 bg-emerald-500/15 text-emerald-200 shadow-sm'
                      : 'border-app-border bg-app-card/40 text-app-text-muted hover:border-app-border-subtle hover:text-app-text'
                  }`}
                >
                  <div className="font-semibold text-[11px] flex items-center gap-1">
                    Auth Code + PKCE
                  </div>
                  <div className="text-[10px] text-app-text-muted opacity-80 mt-0.5">Interactive Challenge (§4.2)</div>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Wallet */}
        <div className={`border rounded-lg p-4 transition-colors ${isTestActive ? 'border-app-border/80 bg-app-base/40' : 'border-app-border bg-app-card/30'}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-app-text">Wallet</h3>
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
                <div className="text-xs text-app-text-muted mt-0.5">{wallet.description}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Verifier */}
        <div className={`border rounded-lg p-4 transition-colors ${isTestActive ? 'border-app-border/80 bg-app-base/40' : 'border-app-border bg-app-card/30'}`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-app-text">Verifier</h3>
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
                <div className="text-xs text-app-text-muted mt-0.5">{verifier.description}</div>
                {selectedCredType?.format === 'mso_mdoc' && (
                  verifier.id === 'verify-local' ? (
                    <div className="text-[11px] text-app-accent mt-1.5 flex items-center gap-1.5 font-sans bg-app-accent-subtle/50 border border-app-border-focus px-2 py-1 rounded">
                      <svg className="w-3.5 h-3.5 text-app-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Inji Verify 0.17 lacks mDoc parser (Planned v0.18.0+)</span>
                    </div>
                  ) : verifier.id === 'inji-verify-collab-live' ? (
                    <div className="text-[11px] text-app-accent mt-1.5 flex items-center gap-1.5 font-sans bg-app-accent-subtle/50 border border-app-border-focus px-2 py-1 rounded">
                      <svg className="w-3.5 h-3.5 text-app-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
