import React from 'react'

interface TamperBannerProps {
  tamperMode: 'none' | 'signature' | 'expired'
  onReset: () => void
}

export const TamperBanner: React.FC<TamperBannerProps> = ({ tamperMode, onReset }) => {
  if (tamperMode === 'none') return null

  return (
    <div className="mb-6 border border-app-tamper-border bg-app-tamper-bg rounded-xl px-4 py-2.5 flex items-center justify-between text-xs text-app-tamper backdrop-blur-sm shadow-sm transition-all animate-fade-in">
      <div className="flex items-center gap-2.5">
        <span className="px-2 py-0.5 rounded-full bg-app-tamper-bg text-app-tamper border border-app-tamper-border text-[10px] font-bold uppercase tracking-wider shrink-0">
          Negative Testing Enabled
        </span>
        <span className="text-app-text-secondary">
          Presentation will be deliberately modified ({tamperMode === 'signature' ? 'invalid cryptographic signature' : 'corrupted token payload'}) to verify rejection by Inji Verify.
        </span>
      </div>
      <button
        onClick={onReset}
        className="text-xs text-app-tamper hover:underline cursor-pointer font-medium shrink-0 ml-3"
      >
        Reset to Normal
      </button>
    </div>
  )
}
