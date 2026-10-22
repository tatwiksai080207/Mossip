import React from 'react'

interface TamperBannerProps {
  tamperMode: 'none' | 'signature' | 'expired'
  onReset: () => void
}

export const TamperBanner: React.FC<TamperBannerProps> = ({ tamperMode, onReset }) => {
  if (tamperMode === 'none') return null

  return (
    <div className="mb-6 border border-amber-500/40 bg-amber-500/10 rounded-lg px-4 py-2.5 flex items-center justify-between text-xs text-amber-300">
      <div className="flex items-center gap-2">
        <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
          Negative Testing Enabled
        </span>
        <span>
          Presentation will be deliberately modified ({tamperMode === 'signature' ? 'invalid cryptographic signature' : 'corrupted token payload'}) to verify rejection by Inji Verify.
        </span>
      </div>
      <button onClick={onReset} className="text-amber-400 hover:underline cursor-pointer">
        Reset to Normal
      </button>
    </div>
  )
}
