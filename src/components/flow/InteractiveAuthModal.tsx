import React, { useState, useEffect } from 'react'
import { useStore } from '../../store'

export const InteractiveAuthModal: React.FC = () => {
  const { pausedStep, oauthUrl, resumeOAuthFlow, cancelOAuthFlow, selectedIssuer, selectedWallet } = useStore()
  const [manualInput, setManualInput] = useState('')
  const [isOpeningPopup, setIsOpeningPopup] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copiedUin, setCopiedUin] = useState(false)

  const extractCode = (input: string): string => {
    const trimmed = input.trim()
    if (trimmed.includes('code=')) {
      try {
        const clean = trimmed.startsWith('http://') || trimmed.startsWith('https://')
          ? trimmed
          : `https://${trimmed}`
        const url = new URL(clean)
        const codeParam = url.searchParams.get('code')
        if (codeParam) return codeParam.split('#')[0].trim()
      } catch {
        const match = trimmed.match(/[?&]code=([^&#]+)/)
        if (match && match[1]) return decodeURIComponent(match[1]).trim()
      }
    }
    return trimmed.split('#')[0].trim()
  }

  // Escape key and global Ctrl+V listener
  useEffect(() => {
    if (!pausedStep) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancelOAuthFlow()
      }
    }

    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text') || ''
      if (text.includes('code=')) {
        const code = extractCode(text)
        if (code) {
          setManualInput(text)
          resumeOAuthFlow(code)
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('paste', handlePaste)
    }
  }, [pausedStep, resumeOAuthFlow, cancelOAuthFlow])

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
      setErrorMsg('Popup was blocked by your browser. Please allow popups or paste the redirect URL manually.')
    }
  }

  const handlePasteFromClipboard = async () => {
    try {
      if (!navigator.clipboard?.readText) {
        setErrorMsg('Clipboard access not supported. Please paste the URL into the input field below.')
        return
      }
      const text = await navigator.clipboard.readText()
      if (!text || !text.trim()) {
        setErrorMsg('Clipboard is empty. Copy the URL from the popup address bar first.')
        return
      }
      setManualInput(text)
      const code = extractCode(text)
      if (code) {
        resumeOAuthFlow(code)
      } else {
        setErrorMsg('No valid authorization code found in clipboard.')
      }
    } catch {
      setErrorMsg('Unable to read clipboard. Please paste the URL into the input field below.')
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

    const code = extractCode(trimmed)
    resumeOAuthFlow(code)
  }

  const copyUin = () => {
    navigator.clipboard.writeText('6207495860')
    setCopiedUin(true)
    setTimeout(() => setCopiedUin(false), 2000)
  }

  const isCollab = selectedIssuer?.env === 'collab' || selectedWallet?.id === 'inji-web-collab-interactive'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg rounded-xl border border-slate-800 bg-slate-900 shadow-2xl p-6 text-slate-200">
        
        {/* Header */}
        <div className="flex items-start justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">
                {isCollab ? 'eSignet Authentication' : 'Authentication Required'}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedIssuer?.name || 'Republic of Veridonia National ID Department'}
              </p>
            </div>
          </div>

          {/* Close / Cross Button */}
          <button
            type="button"
            onClick={cancelOAuthFlow}
            aria-label="Close dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus:outline-none"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Identity Details */}
        {isCollab && (
          <div className="mt-4 rounded-lg bg-slate-950/70 border border-slate-800 p-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px]">Resident Name</span>
              <span className="font-medium text-slate-200">Molleti Tatwik Sai</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">Registered UIN</span>
              <div className="flex items-center gap-1.5 font-mono text-slate-200">
                <span className="font-semibold text-slate-100">6207495860</span>
                <button
                  type="button"
                  onClick={copyUin}
                  title="Copy UIN"
                  className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {copiedUin ? (
                    <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        <p className="mt-3 text-xs text-slate-400 leading-relaxed">
          Log in via eSignet to complete identity authentication. Once redirected, submit the authorization code or redirect URL below to finalize credential issuance.
        </p>

        {/* Primary Action Button */}
        <div className="mt-4 space-y-3">
          <button
            type="button"
            onClick={handleOpenPopup}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm transition-colors shadow-sm"
          >
            <span>Launch eSignet Login Window</span>
            <svg className="w-4 h-4 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </button>

          {isOpeningPopup && (
            <div className="flex items-center justify-center gap-2 text-xs text-blue-400 py-1">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span>Authentication window active</span>
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Divider */}
          <div className="relative py-2">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-800" />
            </div>
            <div className="relative flex justify-center text-xs">
              <span className="bg-slate-900 px-2 text-slate-500">Authorization Code / Redirect URL</span>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleManualSubmit} className="space-y-3">
            <div className="relative">
              <input
                type="text"
                placeholder="Paste redirect URL or ?code=..."
                value={manualInput}
                onChange={(e) => setManualInput(e.target.value)}
                className="w-full rounded-lg bg-slate-950 border border-slate-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 px-3.5 py-2.5 pr-24 text-xs text-slate-200 placeholder:text-slate-500 font-mono transition-colors outline-none"
              />
              <button
                type="button"
                onClick={handlePasteFromClipboard}
                title="Paste from clipboard"
                className="absolute right-1.5 top-1.5 bottom-1.5 px-2.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium flex items-center gap-1.5 border border-slate-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                <span>Paste</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={cancelOAuthFlow}
                className="px-4 py-2 rounded-lg border border-slate-800 hover:border-slate-700 bg-slate-900 hover:bg-slate-800/80 text-slate-300 hover:text-white text-xs font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 px-4 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition-colors shadow-sm"
              >
                Submit Code & Complete Issuance
              </button>
            </div>
          </form>

        </div>
      </div>
    </div>
  )
}

export default InteractiveAuthModal
