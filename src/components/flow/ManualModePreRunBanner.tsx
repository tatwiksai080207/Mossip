import React from 'react'
import type { WalletConfig } from '../../types'

interface ManualModePreRunBannerProps {
  selectedWallet: WalletConfig | null
  tunnelUrl: string
  isRunning: boolean
}

export const ManualModePreRunBanner: React.FC<ManualModePreRunBannerProps> = ({
  selectedWallet,
  tunnelUrl,
  isRunning,
}) => {
  if (isRunning) return null

  if (selectedWallet?.id === 'inji-mobile') {
    return (
      <div className="mb-6 p-4 rounded-lg bg-blue-950/40 border border-blue-500/30 text-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-blue-100">Physical Inji Mobile Wallet Selected</h4>
            <p className="text-xs text-blue-300/80 mt-0.5 max-w-2xl">
              When you click <strong>Run Test</strong>, an interactive QR code modal will automatically open at eye level for you to scan with the Inji Mobile App.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs shrink-0">
          <span className="text-slate-400">Tunnel:</span>
          <code className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-emerald-400 font-mono text-[11px]">
            {tunnelUrl || 'Checking...'}
          </code>
          <a
            href="https://github.com/mosip/inji/releases"
            target="_blank"
            rel="noreferrer"
            className="px-2.5 py-1 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/40 text-blue-200 rounded font-medium transition-colors"
          >
            Get Inji APK
          </a>
        </div>
      </div>
    )
  }

  if (selectedWallet?.id === 'inji-web-manual') {
    return (
      <div className="mb-6 p-4 rounded-lg bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center shrink-0 mt-0.5">
            <svg className="w-4 h-4 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
            </svg>
          </div>
          <div>
            <h4 className="text-sm font-semibold text-indigo-100">Inji Web Wallet (Port 3004) Selected</h4>
            <p className="text-xs text-indigo-300/80 mt-0.5 max-w-2xl">
              When you click <strong>Run Test</strong>, an interactive modal will prompt you to download the credential into your local Inji Web container and present it.
            </p>
          </div>
        </div>

        <a
          href="http://localhost:3004"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 rounded text-xs font-medium transition-colors shrink-0"
        >
          Open Inji Web (Port 3004)
        </a>
      </div>
    )
  }

  return null
}
