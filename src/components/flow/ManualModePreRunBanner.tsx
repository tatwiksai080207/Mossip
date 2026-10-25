import React from 'react'
import type { WalletConfig } from '../../types'
import appLinks from '../../config/app-links.json'

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
    <div className="mb-6 p-4 rounded-xl bg-app-accent-subtle border border-app-border-focus text-app-text flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg backdrop-blur-sm">
      <div className="flex items-start gap-3.5">
        <div className="w-9 h-9 rounded-xl bg-app-accent/20 border border-app-accent/40 flex items-center justify-center shrink-0 mt-0.5">
          <svg className="w-5 h-5 text-app-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-app-text">Inji Wallet (Interactive)</h4>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-app-accent/20 text-app-accent border border-app-accent/30">
              Live
            </span>
          </div>
          <p className="text-xs text-app-text-muted mt-0.5">
            Click <strong className="text-app-text">Run Test</strong> to scan with Inji Mobile or open Inji Web.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2.5 text-xs shrink-0 flex-wrap sm:flex-nowrap">
        {tunnelUrl && (
          <div className="hidden md:flex items-center gap-1.5 text-app-text-muted">
            <span>Tunnel:</span>
            <code className="px-2 py-0.5 bg-app-base border border-app-border rounded text-emerald-400 font-mono text-[11px]">
              {tunnelUrl}
            </code>
          </div>
        )}
        <a
          href="http://localhost:3004"
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 bg-app-card hover:bg-app-card-hover border border-app-border hover:border-app-border-focus text-app-text rounded-lg text-xs font-medium transition-colors"
        >
          Open Inji Web
        </a>
        <a
          href={appLinks.injiMobileApkDrive}
          target="_blank"
          rel="noreferrer"
          className="px-3 py-1.5 bg-app-accent hover:bg-app-accent-hover text-white rounded-lg text-xs font-medium transition-colors shadow-sm"
        >
          Get Inji APK
        </a>
      </div>
    </div>
  )
}

export default ManualModePreRunBanner
