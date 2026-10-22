import React, { useState } from 'react'
import QRCode from 'react-qr-code'
import type { IssuerConfig, WalletConfig, CredentialType, FlowStepInfo } from '../../types'

interface ManualIssuanceSectionProps {
  selectedWallet: WalletConfig | null
  selectedIssuer: IssuerConfig | null
  selectedCredType: CredentialType | null
  offerUri: string | null
  vpRequestDeepLink: string | null
  vpRequestStep?: FlowStepInfo
  isRunning: boolean
  onContinueVerification: () => void
}

export const ManualIssuanceSection: React.FC<ManualIssuanceSectionProps> = ({
  selectedIssuer,
  selectedCredType,
  offerUri,
  vpRequestDeepLink,
  vpRequestStep,
  isRunning,
  onContinueVerification,
}) => {
  const [channel, setChannel] = useState<'mobile' | 'web'>('mobile')

  if (!offerUri || vpRequestDeepLink) return null

  return (
    <div className="mt-8 flex flex-col items-center justify-center p-8 border border-slate-800 rounded-2xl bg-slate-900/50">
      {/* Channel Segmented Switcher */}
      <div className="mb-6 bg-slate-950/80 p-1 rounded-xl border border-slate-800 flex items-center gap-1 w-full max-w-xs">
        <button
          type="button"
          onClick={() => setChannel('mobile')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            channel === 'mobile'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
          <span>Inji Mobile (QR)</span>
        </button>
        <button
          type="button"
          onClick={() => setChannel('web')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            channel === 'web'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
          }`}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
          </svg>
          <span>Inji Web (Browser)</span>
        </button>
      </div>

      {channel === 'mobile' ? (
        <>
          <h3 className="text-lg font-medium text-slate-200 mb-2">Manual Issuance QR Code</h3>
          <p className="text-sm text-slate-400 mb-6 text-center max-w-md">
            Scan this QR code using the official Inji Mobile App.
          </p>
          <div className="bg-white p-4 rounded-xl mb-6">
            <QRCode value={offerUri} size={256} />
          </div>

          <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-lg p-4 mb-4">
            <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Raw Deep Link (For Copy/Pasting)</p>
            <code className="text-xs text-green-400 break-all">{offerUri}</code>
          </div>

          <p className="text-sm text-slate-400 mb-4 text-center max-w-lg">
            <strong className="text-slate-200">Where is the mobile app?</strong> Search for "Inji Wallet" on the Play Store/App Store, or download the APK directly from the{' '}
            <a href="https://drive.google.com/drive/folders/1gBjFSdpjxU4bsZi7-xS59W1-EIFKrkS8" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">
              Inji Wallet APK Drive
            </a>.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-lg font-medium text-slate-200 mb-2">Web Wallet Issuance</h3>
          <p className="text-sm text-slate-400 mb-6 text-center max-w-md">
            Directly download the credential offer into your local web wallet.
          </p>
          {(() => {
            const mimotoIssuerId = selectedIssuer?.id === 'certify-local'
              ? 'Farmer'
              : (selectedIssuer?.id === 'issuer-waltid' ? 'WaltId' : 'Playground')
            const targetCredId = selectedCredType?.id || selectedCredType?.credentialTypeName || 'PlaygroundIdentityCredential'
            const rawOffer = new URL(offerUri.replace('openid-credential-offer://', 'http://dummy')).searchParams.get('credential_offer') || ''
            const directWalletIssuanceUrl = `http://localhost:3004/user/issuers/${mimotoIssuerId}?credential_id=${encodeURIComponent(targetCredId)}&auto_download=true&credential_offer=${encodeURIComponent(rawOffer)}`
            return (
              <>
                <div className="flex flex-col sm:flex-row items-center gap-3 mt-2 mb-3">
                  <a
                    href={directWalletIssuanceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                  >
                    Open & Directly Download in Web Wallet
                  </a>
                  <a
                    href="http://localhost:3004"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-700"
                  >
                    Login / Unlock Wallet First
                  </a>
                </div>
                <p className="text-xs text-blue-400/90 mb-4 text-center max-w-lg bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-md">
                  <strong>Direct Flow:</strong> Routes directly to <strong>{selectedIssuer?.name || 'Playground Issuer'}</strong> and auto-selects <strong>{selectedCredType?.name || targetCredId}</strong> for download.
                </p>
              </>
            )
          })()}
          <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-lg p-4 mb-4">
            <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Raw Deep Link (For Copy/Pasting)</p>
            <code className="text-xs text-green-400 break-all">{offerUri}</code>
          </div>
        </>
      )}

      {!vpRequestStep || vpRequestStep.status === 'pending' ? (
        <button
          onClick={onContinueVerification}
          disabled={isRunning}
          className="mt-6 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
        >
          {isRunning ? 'Running...' : 'Proceed to Verification'}
        </button>
      ) : null}
    </div>
  )
}

export default ManualIssuanceSection
