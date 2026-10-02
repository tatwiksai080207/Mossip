import React, { useState } from 'react'
import { useStore } from '../store'

export const InteractiveAuthModal: React.FC = () => {
  const { pausedStep, oauthUrl, resumeOAuthFlow, selectedIssuer, selectedWallet } = useStore()
  const [manualInput, setManualInput] = useState('')
  const [isOpeningPopup, setIsOpeningPopup] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Only render when paused waiting for OAuth
  if (!pausedStep || !oauthUrl) return null

  const handleOpenPopup = () => {
    setIsOpeningPopup(true)
    setErrorMsg(null)
    const popup = window.open(
      oauthUrl,
      'eSignet Login',
      'width=540,height=700,menubar=no,toolbar=no,location=no,status=no'
    )
    if (!popup || popup.closed || typeof popup.closed === 'undefined') {
      setErrorMsg('Popup was blocked by your browser. Please allow popups or copy the URL below manually.')
    }
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    const trimmed = manualInput.trim()
    if (!trimmed) {
      setErrorMsg('Please enter an authorization code or redirect URL.')
      return
    }

    let code = trimmed
    // If user pasted full redirect URL: e.g. https://.../redirect?state=...&code=XYZ
    if (trimmed.includes('code=')) {
      try {
        const url = new URL(trimmed.startsWith('http') ? trimmed : `http://dummy.com/${trimmed}`)
        const codeParam = url.searchParams.get('code')
        if (codeParam) {
          code = codeParam
        }
      } catch {
        const match = trimmed.match(/[?&]code=([^&]+)/)
        if (match && match[1]) {
          code = decodeURIComponent(match[1])
        }
      }
    }

    resumeOAuthFlow(code)
  }

  const isCollab = selectedIssuer?.env === 'collab' || selectedWallet?.id === 'inji-web-collab-interactive'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-xl border border-sky-500/30 bg-slate-900 shadow-2xl p-6 text-slate-200">
        {/* Header */}
        <div className="flex items-start gap-4 mb-5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-sky-500/20 text-sky-400 text-2xl border border-sky-500/30">
            🛡️
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">
              {isCollab ? 'eSignet Authentication Required (Collab)' : 'User Authentication Required'}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              {selectedIssuer?.name || 'Republic of Veridonia National ID Department'}
            </p>
          </div>
        </div>

        {/* Identity & Instructions Card */}
        <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-4 mb-5 text-sm space-y-2">
          {isCollab && (
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
              <span className="text-slate-400">Target Identity (Resident):</span>
              <span className="font-semibold text-sky-300">Molleti Tatwik Sai</span>
            </div>
          )}
          {isCollab && (
            <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs">
              <span className="text-slate-400">Registered UIN:</span>
              <span className="font-mono font-bold text-amber-300 bg-amber-500/10 px-2 py-0.5 rounded">
                6207495860
              </span>
            </div>
          )}
          <div className="text-xs text-slate-300 space-y-1 pt-1">
            <p className="font-medium text-slate-200">Instructions to complete the interactive test:</p>
            <ol className="list-decimal list-inside space-y-0.5 text-slate-400 pl-1">
              <li>Click <strong className="text-slate-200">Launch eSignet Login</strong> below.</li>
              <li>Enter UIN <strong className="text-amber-300 font-mono">6207495860</strong> and click <strong className="text-slate-200">Get OTP</strong>.</li>
              <li>Enter the OTP received in your personal email and click <strong className="text-slate-200">Verify</strong>.</li>
            </ol>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="space-y-3">
          <button
            type="button"
            onClick={handleOpenPopup}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-colors shadow-lg shadow-sky-600/20"
          >
            <span>Launch eSignet Login Window</span>
            <span className="text-xs bg-sky-700/60 px-1.5 py-0.5 rounded">↗</span>
          </button>

          {isOpeningPopup && (
            <div className="flex items-center justify-center gap-2 text-xs text-sky-400 py-1">
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
              <span>Waiting for login completion in popup...</span>
            </div>
          )}

          {errorMsg && (
            <div className="rounded border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Fallback Manual Code Paste */}
          <div className="pt-2 border-t border-slate-800">
            <details open className="text-xs text-slate-400 group">
              <summary className="cursor-pointer hover:text-slate-300 font-medium select-none flex items-center gap-1.5 mb-2">
                <span>▾</span>
                <span>Submit Authorization Code or Redirect URL</span>
              </summary>
              <form onSubmit={handleManualSubmit} className="space-y-2">
                <input
                  type="text"
                  placeholder="Paste ?code=... or full redirect URL from popup address bar here"
                  value={manualInput}
                  onChange={(e) => setManualInput(e.target.value)}
                  className="w-full rounded bg-slate-950 border border-slate-700 px-3 py-2 text-xs text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-sky-500 font-mono"
                />
                <button
                  type="submit"
                  className="w-full py-2 px-3 rounded bg-sky-700 hover:bg-sky-600 text-white text-xs font-medium transition-colors shadow-sm"
                >
                  Submit Code & Complete Issuance
                </button>
              </form>
            </details>
          </div>
        </div>
      </div>
    </div>
  )
}
