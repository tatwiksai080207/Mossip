import React, { useState } from 'react'
import QRCode from 'react-qr-code'
import type { WalletConfig } from '../../types'

interface ManualPresentationSectionProps {
  selectedWallet: WalletConfig | null
  vpRequestDeepLink: string | null
  vpClientId: string | null
  requestUri: string | null
  isRunning: boolean
  onCheckVerificationResult: () => void
}

export const ManualPresentationSection: React.FC<ManualPresentationSectionProps> = ({
  vpRequestDeepLink,
  vpClientId,
  requestUri,
  isRunning,
  onCheckVerificationResult,
}) => {
  const [channel, setChannel] = useState<'mobile' | 'web'>('mobile')

  if (!vpRequestDeepLink) return null

  return (
    <div className="mt-4 flex flex-col items-center justify-center p-8 border border-app-border rounded-2xl bg-app-card/50 backdrop-blur-sm">
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
          <h3 className="text-lg font-medium text-app-text mb-2">Manual Presentation QR Code</h3>
          <p className="text-sm text-app-text-muted mb-6 text-center max-w-md">
            Scan this QR code using the official Inji Mobile App's "Share" tab to present your credential.
          </p>
          <div className="bg-white p-4 rounded-xl mb-6 shadow-md">
            <QRCode value={vpRequestDeepLink} size={256} />
          </div>
        </>
      ) : (
        <>
          <h3 className="text-lg font-medium text-app-text mb-2">Web Wallet Presentation</h3>
          <p className="text-sm text-app-text-muted mb-6 text-center max-w-md">
            Present your credential directly using your local Inji Web wallet.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3 mt-2 mb-3">
            <a
              href={`http://localhost:3004/user/authorize?client_id=${encodeURIComponent(vpClientId || '')}&response_type=vp_token&response_mode=direct_post&request_uri=${encodeURIComponent((requestUri || '').replace(/localhost:3001|127\.0\.0\.1:3001/g, 'host.docker.internal:3001'))}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-app-accent hover:bg-app-accent-hover text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              Present from Local Web Wallet
            </a>
            <a
              href="http://localhost:3004"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 bg-app-card hover:bg-app-card-hover text-app-text text-xs font-medium rounded-lg transition-colors border border-app-border"
            >
              1. Open / Login to Web Wallet
            </a>
          </div>
          <p className="text-xs text-app-text-secondary mb-4 text-center max-w-lg bg-app-accent-subtle/40 border border-app-border-focus px-3.5 py-2 rounded-lg">
            <strong className="text-app-accent font-semibold">Tip:</strong> Ensure you are signed in to your Inji Web wallet and have entered your 6-digit passcode before presenting.
          </p>
        </>
      )}

      <div className="w-full max-w-2xl bg-app-base border border-app-border rounded-lg p-4 mb-4">
        <p className="text-xs text-app-text-muted mb-2 font-medium uppercase tracking-wider">Raw Deep Link (For Copy/Pasting)</p>
        <code className="text-xs text-app-accent break-all">{vpRequestDeepLink}</code>
      </div>

      <button
        onClick={onCheckVerificationResult}
        disabled={isRunning}
        className="mt-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer shadow-md"
      >
        {isRunning ? 'Checking...' : 'Check Verification Result'}
      </button>
    </div>
  )
}

export default ManualPresentationSection
