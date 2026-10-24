import React, { useState, useEffect } from 'react'
import { useStore } from '../../store/index'

export const InteractiveAuthModal: React.FC = () => {
  const { pausedStep, oauthUrl, resumeOAuthFlow, cancelOAuthFlow, selectedIssuer, selectedWallet } = useStore()
  const [isOpen, setIsOpen] = useState(true)
  const [manualInput, setManualInput] = useState('')
  const [isOpeningPopup, setIsOpeningPopup] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [copiedUin, setCopiedUin] = useState(false)

  // Re-open modal whenever pausedStep becomes active
  useEffect(() => {
    if (pausedStep && oauthUrl) {
      setIsOpen(true)
      setErrorMsg(null)
    }
  }, [pausedStep, oauthUrl])

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

  // Escape key closes modal & paste helper (never auto-submits)
  useEffect(() => {
    if (!pausedStep) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false)
      }
    }

    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') {
        return
      }
      const text = e.clipboardData?.getData('text') || ''
      if (text) {
        setManualInput(text.trim())
        setErrorMsg(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('paste', handlePaste)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('paste', handlePaste)
    }
  }, [pausedStep])

  if (!pausedStep || !oauthUrl) return null

  // Floating Minimized Widget
  if (!isOpen) {
    return (
      <aside
        aria-label="Pending authentication action"
        className="fixed bottom-6 right-6 z-50 animate-bounce"
      >
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-3 px-4 py-3 bg-app-card/95 hover:bg-app-card text-app-text font-medium text-sm rounded-full shadow-[0_10px_35px_rgba(0,0,0,0.6)] border border-app-border-focus cursor-pointer transition-all hover:scale-105 active:scale-95 group"
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-app-accent opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-app-accent" />
          </span>
          <span className="text-app-text font-medium">
            Action Required: Complete eSignet Login
          </span>
          <div className="w-6 h-6 rounded-full bg-app-base flex items-center justify-center text-app-text-muted group-hover:text-white group-hover:bg-app-accent transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </div>
        </button>
      </aside>
    )
  }

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
      setManualInput(text.trim())
      setErrorMsg(null)
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
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="interactive-auth-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/80 backdrop-blur-md animate-fade-in"
    >
      <div className="bg-app-card border border-app-border rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] max-w-lg w-full flex flex-col overflow-hidden animate-scale-up">
        
        {/* Header */}
        <div className="px-6 py-5 flex items-center justify-between border-b border-app-border bg-app-accent-subtle/30">
          <div className="flex items-center gap-3.5">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border bg-app-accent/15 border-app-accent/30 text-app-accent">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-semibold tracking-wide px-2.5 py-0.5 rounded-full border bg-app-accent/15 text-app-accent border-app-accent/30">
                  Step 1 of 2 · eSignet OIDC
                </span>
                <span className="text-xs text-app-text-muted font-medium">
                  Identity Auth
                </span>
              </div>
              <h3 id="interactive-auth-title" className="text-lg font-semibold text-app-text tracking-tight mt-1">
                {isCollab ? 'eSignet Authentication' : 'Authentication Required'}
              </h3>
            </div>
          </div>

          {/* Close / Minimize Button */}
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Minimize dialog"
            title="Minimize modal (Escape)"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-app-text-muted hover:text-app-text hover:bg-app-card-hover transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Identity Details Card */}
          {isCollab && (
            <div className="rounded-xl bg-app-base/70 border border-app-border p-3.5 space-y-2.5 shadow-sm">
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1.5 text-app-text-muted font-medium">
                  <svg className="w-3.5 h-3.5 text-app-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="font-semibold uppercase tracking-wider text-app-text-muted">Resident Test Credentials</span>
                </div>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <span>Verified Profile</span>
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="bg-app-card border border-app-border p-2.5 rounded-lg">
                  <span className="text-app-text-muted block text-[10px] font-medium uppercase tracking-wide">Resident Name</span>
                  <span className="font-medium text-app-text text-xs mt-0.5 block">Molleti Tatwik Sai</span>
                </div>
                <div className="bg-app-card border border-app-border p-2.5 rounded-lg">
                  <span className="text-app-text-muted block text-[10px] font-medium uppercase tracking-wide">Registered UIN</span>
                  <div className="flex items-center justify-between mt-0.5">
                    <span className="font-mono font-semibold text-app-text text-xs">6207495860</span>
                    <button
                      type="button"
                      onClick={copyUin}
                      title="Copy UIN to clipboard"
                      className="flex items-center gap-1 text-[11px] text-app-accent hover:underline font-medium cursor-pointer transition-colors"
                    >
                      {copiedUin ? (
                        <>
                          <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-emerald-400 text-[10px] font-semibold">Copied</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                          <span className="text-[10px]">Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-app-text-secondary leading-relaxed text-center max-w-md mx-auto">
            Log in via eSignet with the UIN above to approve credential issuance. Once redirected, submit the authorization code below to finalize.
          </p>

          {/* Action Step 1: Open Popup Window */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleOpenPopup}
              className="w-full py-2.5 px-4 bg-app-accent hover:bg-app-accent-hover text-white font-medium text-xs sm:text-sm rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
            >
              <span>Launch eSignet Login Window</span>
              <svg className="w-4 h-4 text-white/80" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </button>

            {isOpeningPopup && (
              <div className="flex items-center justify-center gap-2 text-xs text-app-accent py-1.5 px-3 bg-app-accent-subtle border border-app-border-focus rounded-xl">
                <span className="w-2 h-2 rounded-full bg-app-accent animate-pulse" />
                <span>Authentication window active · Complete OTP login in popup</span>
              </div>
            )}

            {errorMsg && (
              <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300 flex items-start gap-2">
                <svg className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{errorMsg}</span>
              </div>
            )}

            {/* Divider */}
            <div className="relative py-1">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-app-border" />
              </div>
              <div className="relative flex justify-center text-[11px]">
                <span className="bg-app-card px-3 text-app-text-muted font-medium">Authorization Code / Redirect URL</span>
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
                  className="w-full rounded-xl bg-app-base border border-app-border focus:border-app-border-focus focus:ring-1 focus:ring-app-accent/30 px-3.5 py-2.5 pr-20 text-xs text-app-text placeholder:text-app-text-muted font-mono transition-colors outline-none"
                />
                <button
                  type="button"
                  onClick={handlePasteFromClipboard}
                  title="Paste from clipboard"
                  className="absolute right-1.5 top-1.5 bottom-1.5 px-2.5 rounded-lg bg-app-card hover:bg-app-card-hover text-app-text-secondary hover:text-app-text text-xs font-medium flex items-center gap-1.5 border border-app-border transition-colors cursor-pointer"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                  </svg>
                  <span>Paste</span>
                </button>
              </div>

              {/* Actions Footer inside modal */}
              <div className="flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={cancelOAuthFlow}
                  className="text-xs font-medium text-app-text-muted hover:text-rose-400 hover:bg-rose-500/10 px-3.5 py-2 rounded-xl border border-app-border hover:border-rose-500/30 transition-all cursor-pointer flex items-center gap-2"
                  title="Abort this test run"
                >
                  <svg className="w-3.5 h-3.5 text-rose-400" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="5" y="5" width="14" height="14" rx="2" />
                  </svg>
                  <span>Abort Test</span>
                </button>

                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-app-accent hover:bg-app-accent-hover text-white text-xs sm:text-sm font-semibold shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <span>Submit Code &amp; Complete Issuance</span>
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}

export default InteractiveAuthModal
