import React from 'react'
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
  selectedWallet,
  vpRequestDeepLink,
  vpClientId,
  requestUri,
  isRunning,
  onCheckVerificationResult,
}) => {
  if (!vpRequestDeepLink) return null

  return (
    <div className="mt-4 flex flex-col items-center justify-center p-8 border border-slate-800 rounded-lg bg-slate-900/50">
      {selectedWallet?.id === 'inji-mobile' ? (
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
              Present from Local Web Wallet (Port 3004)
            </a>
            <a
              href="http://localhost:3004"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-700"
            >
              1. Open / Login to Wallet (Port 3004)
            </a>
          </div>
          <p className="text-xs text-amber-400/90 mb-4 text-center max-w-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-md">
            💡 <strong>Tip:</strong> Ensure you are signed in to your Inji Web wallet and have entered your 6-digit passcode before presenting.
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
        className="mt-2 px-6 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
      >
        {isRunning ? 'Checking...' : 'Check Verification Result'}
      </button>
    </div>
  )
}
