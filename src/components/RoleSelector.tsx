import { issuers, wallets, verifiers } from '../config'
import type { IssuerConfig, WalletConfig, VerifierConfig, CredentialType } from '../types'

interface Props {
  selectedIssuer: IssuerConfig | null
  selectedWallet: WalletConfig | null
  selectedVerifier: VerifierConfig | null
  selectedCredType: CredentialType | null
  onIssuerSelect: (issuer: IssuerConfig) => void
  onWalletSelect: (wallet: WalletConfig) => void
  onVerifierSelect: (verifier: VerifierConfig) => void
  onCredTypeSelect: (ct: CredentialType) => void
}

export default function RoleSelector({
  selectedIssuer, selectedWallet, selectedVerifier, selectedCredType,
  onIssuerSelect, onWalletSelect, onVerifierSelect, onCredTypeSelect,
}: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {/* Issuer */}
      <div className="border border-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Issuer</h3>
        <div className="space-y-2">
          {issuers.map((issuer) => (
            <button
              key={issuer.id}
              onClick={() => onIssuerSelect(issuer)}
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
                  onClick={() => onCredTypeSelect(ct)}
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

      {/* Wallet */}
      <div className="border border-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Wallet</h3>
        <div className="space-y-2">
          {wallets.map((wallet) => (
            <button
              key={wallet.id}
              onClick={() => onWalletSelect(wallet)}
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

      {/* Verifier */}
      <div className="border border-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-3">Verifier</h3>
        <div className="space-y-2">
          {verifiers.map((verifier) => (
            <button
              key={verifier.id}
              onClick={() => onVerifierSelect(verifier)}
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
  )
}
