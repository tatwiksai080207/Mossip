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
    <div className="mt-8 flex flex-col items-center justify-center p-8 border border-app-border rounded-2xl bg-app-card/50 backdrop-blur-sm">
      {/* Channel Segmented Switcher */}
      <div className="mb-6 bg-app-base/80 p-1 rounded-xl border border-app-border flex items-center gap-1 w-full max-w-xs">
        <button
          type="button"
          onClick={() => setChannel('mobile')}
          className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            channel === 'mobile'
              ? 'bg-app-accent text-white shadow-md'
              : 'text-app-text-muted hover:text-app-text hover:bg-app-card'
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
              ? 'bg-app-accent text-white shadow-md'
              : 'text-app-text-muted hover:text-app-text hover:bg-app-card'
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
          <h3 className="text-lg font-medium text-app-text mb-2">Manual Issuance QR Code</h3>
          <p className="text-sm text-app-text-muted mb-6 text-center max-w-md">
            Scan this QR code using the official Inji Mobile App.
          </p>
          <div className="bg-white p-4 rounded-xl mb-6 shadow-md">
            <QRCode value={offerUri} size={256} />
          </div>

          <div className="w-full max-w-2xl bg-app-base border border-app-border rounded-lg p-4 mb-4">
            <p className="text-xs text-app-text-muted mb-2 font-medium uppercase tracking-wider">Raw Deep Link (For Copy/Pasting)</p>
            <code className="text-xs text-emerald-400 break-all">{offerUri}</code>
          </div>

          <p className="text-sm text-app-text-muted mb-4 text-center max-w-lg">
            <strong className="text-app-text">Where is the mobile app?</strong> Search for "Inji Wallet" on the Play Store/App Store, or download the APK directly from the{' '}
            <a href="https://drive.google.com/drive/folders/1gBjFSdpjxU4bsZi7-xS59W1-EIFKrkS8" target="_blank" rel="noreferrer" className="text-app-accent hover:underline">
              Inji Wallet APK Drive
            </a>.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-lg font-medium text-app-text mb-2">Web Wallet Issuance</h3>
          <p className="text-sm text-app-text-muted mb-6 text-center max-w-md">
            Directly download the credential offer into your local web wallet.
          </p>
          {(() => {
            const mimotoIssuerId = selectedIssuer?.id === 'certify-local'
              ? 'Farmer'
              : (selectedIssuer?.id === 'issuer-waltid'
                ? 'WaltId'
                : (selectedIssuer?.id === 'issuer-sphereon' ? 'Sphereon' : 'Playground'))
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
                    className="inline-flex items-center gap-2 px-4 py-2 bg-app-accent hover:bg-app-accent-hover text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                  >
                    Open & Directly Download in Web Wallet
                  </a>
                  <a
                    href="http://localhost:3004"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 bg-app-card hover:bg-app-card-hover text-app-text text-xs font-medium rounded-lg transition-colors border border-app-border"
                  >
                    Login / Unlock Wallet First
                  </a>
                </div>
                <p className="text-xs text-app-accent mb-4 text-center max-w-lg bg-app-accent-subtle border border-app-border-focus px-3 py-1.5 rounded-md">
                  <strong>Direct Flow:</strong> Routes directly to <strong>{selectedIssuer?.name || 'Playground Issuer'}</strong> and auto-selects <strong>{selectedCredType?.name || targetCredId}</strong> for download.
                </p>
              </>
            )
          })()}
          <div className="w-full max-w-2xl bg-app-base border border-app-border rounded-lg p-4 mb-4">
            <p className="text-xs text-app-text-muted mb-2 font-medium uppercase tracking-wider">Raw Deep Link (For Copy/Pasting)</p>
            <code className="text-xs text-emerald-400 break-all">{offerUri}</code>
          </div>
        </>
      )}

      {!vpRequestStep || vpRequestStep.status === 'pending' ? (
        <button
          onClick={onContinueVerification}
          disabled={isRunning}
          className="mt-6 px-6 py-2 bg-app-accent hover:bg-app-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-md"
        >
          {isRunning ? 'Running...' : 'Proceed to Verification'}
        </button>
      ) : null}
    </div>
  )
}

export default ManualIssuanceSection
