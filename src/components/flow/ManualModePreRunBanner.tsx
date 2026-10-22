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

  const isInteractiveWallet =
    selectedWallet?.id === 'inji-wallet-interactive' ||
    selectedWallet?.id === 'inji-mobile' ||
    selectedWallet?.id === 'inji-web-manual'

  if (!isInteractiveWallet) return null

  return (
    <div className="mb-6 p-4 rounded-xl bg-blue-950/40 border border-blue-500/30 text-blue-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg backdrop-blur-sm">
      <div className="flex items-start gap-3.5">
        <div className="w-9 h-9 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-5 h-5 text-blue-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-blue-100">Inji Wallet (Interactive)</h4>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
              Live
            </span>
          </div>
          <p className="text-xs text-blue-300/80 mt-0.5">
            Click <strong>Run Test</strong> to scan with Inji Mobile or open Inji Web.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 text-xs shrink-0 flex-wrap sm:flex-nowrap">
        {tunnelUrl && (
          <div className="hidden md:flex items-center gap-1.5 text-slate-400">
            <span>Tunnel:</span>
            <code className="px-2 py-0.5 bg-slate-900 border border-slate-700 rounded text-emerald-400 font-mono text-[11px]">
              {tunnelUrl}
            </code>
          </div>
        )}
        <a
          href="http://localhost:3004"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/40 text-indigo-200 rounded-lg text-xs font-medium transition-colors"
        >
          Open Inji Web
        </a>
        <a
          href="https://drive.google.com/drive/folders/1gBjFSdpjxU4bsZi7-xS59W1-EIFKrkS8"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 bg-blue-600/30 hover:bg-blue-600/50 border border-blue-500/40 text-blue-200 rounded-lg text-xs font-medium transition-colors"
        >
          Get Inji APK
        </a>
      </div>
    </div>
  )
}

export default ManualModePreRunBanner
