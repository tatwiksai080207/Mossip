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
    <div className="mt-4 flex flex-col items-center justify-center p-8 border border-slate-800 rounded-2xl bg-slate-900/50">
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
          <h3 className="text-lg font-medium text-slate-200 mb-2">Manual Presentation QR Code</h3>
          <p className="text-sm text-slate-400 mb-6 text-center max-w-md">
            Scan this QR code using the official Inji Mobile App's "Share" tab to present your credential.
          </p>
          <div className="bg-white p-4 rounded-xl mb-6">
            <QRCode value={vpRequestDeepLink} size={256} />
          </div>
        </>
      ) : (
        <>
          <h3 className="text-lg font-medium text-slate-200 mb-2">Web Wallet Presentation</h3>
          <p className="text-sm text-slate-400 mb-6 text-center max-w-md">
            Present your credential directly using your local Inji Web wallet.
          </p>
          <div className="flex flex-col sm:flex-row items-center gap-3 mt-2 mb-3">
            <a
              href={`http://localhost:3004/user/authorize?client_id=${encodeURIComponent(vpClientId || '')}&response_type=vp_token&response_mode=direct_post&request_uri=${encodeURIComponent((requestUri || '').replace(/localhost:3001|127\.0\.0\.1:3001/g, 'host.docker.internal:3001'))}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
            >
              Present from Local Web Wallet
            </a>
            <a
              href="http://localhost:3004"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-700"
            >
              1. Open / Login to Web Wallet
            </a>
          </div>
          <p className="text-xs text-amber-400/90 mb-4 text-center max-w-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-md">
            <strong>Tip:</strong> Ensure you are signed in to your Inji Web wallet and have entered your 6-digit passcode before presenting.
          </p>
        </>
      )}

      <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-lg p-4 mb-4">
        <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Raw Deep Link (For Copy/Pasting)</p>
        <code className="text-xs text-blue-400 break-all">{vpRequestDeepLink}</code>
      </div>

      <button
        onClick={onCheckVerificationResult}
        disabled={isRunning}
        className="mt-2 px-6 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
      >
        {isRunning ? 'Checking...' : 'Check Verification Result'}
      </button>
    </div>
  )
}

export default ManualPresentationSection
