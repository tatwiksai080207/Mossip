import React, { useState, useEffect } from 'react'
import QRCode from 'react-qr-code'
import type { IssuerConfig, WalletConfig, CredentialType, FlowStepInfo } from '../../types'
import { appLinks } from '../../config'

interface InteractiveWalletModalProps {
  selectedWallet: WalletConfig | null
  selectedIssuer: IssuerConfig | null
  selectedCredType: CredentialType | null
  offerUri: string | null
  vpRequestDeepLink: string | null
  vpRequestStep?: FlowStepInfo
  vpClientId: string | null
  requestUri: string | null
  isRunning: boolean
  isTestActive: boolean
  onContinueVerification: () => void
  onCheckVerificationResult: () => void
  onAbortTest: () => void
}

export const InteractiveWalletModal: React.FC<InteractiveWalletModalProps> = ({
  selectedWallet,
  selectedIssuer,
  selectedCredType,
  offerUri,
  vpRequestDeepLink,
  vpRequestStep,
  vpClientId,
  requestUri,
  isRunning,
  isTestActive,
  onContinueVerification,
  onCheckVerificationResult,
  onAbortTest,
}) => {
  const [isOpen, setIsOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const [walletChannel, setWalletChannel] = useState<'mobile' | 'web'>('mobile')
  const [showFullUri, setShowFullUri] = useState(false)

  // Re-open modal whenever a new interactive step becomes active
  useEffect(() => {
    if (offerUri || vpRequestDeepLink) {
      setIsOpen(true)
      setCopied(false)
      setShowFullUri(false)
    }
  }, [offerUri, vpRequestDeepLink])

  // Escape key closes/minimizes modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const isIssuancePhase = Boolean(offerUri && !vpRequestDeepLink)
  const isPresentationPhase = Boolean(vpRequestDeepLink)

  if (!isTestActive || (!isIssuancePhase && !isPresentationPhase)) return null

  const activeUri = isIssuancePhase ? offerUri : vpRequestDeepLink

  const handleCopy = () => {
    if (!activeUri) return
    navigator.clipboard.writeText(activeUri)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Floating Minimized Widget
  if (!isOpen) {
    return (
      <aside
        aria-label="Pending interactive action"
        className="fixed bottom-6 right-6 z-50 animate-bounce"
      >
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-3 px-4 py-3 bg-slate-900/95 hover:bg-slate-800 text-white font-medium text-sm rounded-full shadow-[0_10px_35px_rgba(0,0,0,0.6)] border border-blue-500/40 cursor-pointer transition-all hover:scale-105 active:scale-95 group"
        >
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500" />
          </span>
          <span className="text-slate-100 font-medium">
            {isIssuancePhase ? 'Action Required: Scan Issuance QR' : 'Action Required: Scan Presentation QR'}
          </span>
          <div className="w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 group-hover:text-white group-hover:bg-blue-600 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
            </svg>
          </div>
        </button>
      </aside>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="interactive-wallet-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-950/80 backdrop-blur-md animate-fade-in"
    >
      <div className="bg-slate-900/95 border border-slate-700/60 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.7)] max-w-lg w-full flex flex-col overflow-hidden animate-scale-up">
        
        {/* Header - exactly identical to eSignet Modal header styling */}
        <div className={`px-6 py-5 flex items-center justify-between border-b ${
          isIssuancePhase ? 'border-blue-500/20 bg-blue-950/20' : 'border-emerald-500/20 bg-emerald-950/20'
        }`}>
          <div className="flex items-center gap-3.5">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              isIssuancePhase
                ? 'bg-blue-500/15 border-blue-500/30 text-blue-400'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
            }`}>
              {isIssuancePhase ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[11px] font-semibold tracking-wide px-2.5 py-0.5 rounded-full border ${
                  isIssuancePhase
                    ? 'bg-blue-500/15 text-blue-300 border-blue-500/30'
                    : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                }`}>
                  {isIssuancePhase ? 'Step 1 of 2 · Credential Issuance' : 'Step 2 of 2 · Verification & Presentation'}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {selectedWallet?.name || 'Inji Wallet'}
                </span>
              </div>
              <h3 id="interactive-wallet-title" className="text-lg font-semibold text-white tracking-tight mt-1">
                {isIssuancePhase ? 'Scan or Claim Your Credential' : 'Present Credential for Verification'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            aria-label="Minimize dialog"
            title="Minimize modal (Escape)"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Segmented Channel Switcher */}
          <div className="p-1 bg-slate-950/80 rounded-xl border border-slate-800/90 flex items-center gap-1 shadow-inner">
            <button
              type="button"
              onClick={() => setWalletChannel('mobile')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                walletChannel === 'mobile'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
              </svg>
              <span>Inji Mobile (QR)</span>
            </button>
            <button
              type="button"
              onClick={() => setWalletChannel('web')}
              className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
                walletChannel === 'web'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
              </svg>
              <span>Inji Web (Browser)</span>
            </button>
          </div>

          <p className="text-xs text-slate-300 leading-relaxed text-center max-w-md mx-auto">
            {walletChannel === 'mobile'
              ? (isIssuancePhase
                  ? 'Open your Inji Mobile App and scan this QR code to download and store the Verifiable Credential.'
                  : "In your Inji Mobile App, switch to the 'Share' tab and scan this QR code to present your credential.")
              : (isIssuancePhase
                  ? 'Claim this credential directly into your locally running Inji Web wallet container.'
                  : 'Authenticate and present your credential to Inji Verify via your local Inji Web wallet.')}
          </p>

          {walletChannel === 'mobile' ? (
            /* Inji Mobile QR View */
            <div className="space-y-4">
              {activeUri && (
                <div className="flex justify-center">
                  <div className="bg-white p-3.5 rounded-2xl shadow-xl ring-1 ring-slate-800/10 transition-transform hover:scale-[1.01]">
                    <QRCode value={activeUri} size={190} />
                  </div>
                </div>
              )}

              {/* Protocol Deep Link Card - identical styling to Resident Credentials card */}
              <div className="rounded-xl bg-slate-950/70 border border-slate-800/90 p-3.5 space-y-2.5 shadow-sm">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5 text-slate-400 font-medium">
                    <svg className="w-3.5 h-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <span className="font-semibold uppercase tracking-wider text-slate-400">Protocol Deep Link</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowFullUri(!showFullUri)}
                      className="text-[11px] text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    >
                      {showFullUri ? 'Collapse' : 'Show Full'}
                    </button>
                    <span className="text-slate-700">·</span>
                    <button
                      type="button"
                      onClick={handleCopy}
                      className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 font-medium cursor-pointer transition-colors"
                    >
                      {copied ? (
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

                {showFullUri ? (
                  <code className="text-[11px] font-mono text-emerald-400/90 break-all bg-slate-900/90 border border-slate-800 p-2.5 rounded-lg select-all max-h-24 overflow-y-auto block">
                    {activeUri}
                  </code>
                ) : (
                  <div className="bg-slate-900/80 border border-slate-800 px-3 py-2 rounded-lg flex items-center justify-between">
                    <span className="text-[11px] font-mono text-slate-300 truncate max-w-[380px]">
                      {activeUri}
                    </span>
                  </div>
                )}
              </div>

              {/* Helper download link */}
              <p className="text-[11px] text-slate-400 text-center">
                Need the official app? Download APK from{' '}
                <a
                  href={appLinks.injiMobileApkDrive}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:text-blue-300 hover:underline font-medium inline-flex items-center gap-1"
                >
                  <span>Inji Wallet APK Drive</span>
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              </p>
            </div>
          ) : (
            /* Inji Web Wallet View */
            <div className="space-y-3.5">
              {/* Step 1: Web Wallet Session Card */}
              <div className="rounded-xl bg-slate-950/70 border border-slate-800/90 p-3.5 space-y-2 shadow-sm">
                <div className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-300 px-2 py-0.5 rounded bg-slate-850 border border-slate-750">
                      Step 1
                    </span>
                    <span className="font-semibold text-slate-200">Unlock Inji Web Wallet</span>
                  </div>
                  <span className="text-[10px] font-medium text-slate-400">Pre-requisite</span>
                </div>

                <div className="flex items-center justify-between gap-3 bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg">
                  <p className="text-[11px] text-slate-300 leading-normal">
                    Ensure your local Inji Web container is running and logged in with your PIN.
                  </p>
                  <a
                    href={appLinks.injiWebLocalUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-750 text-xs font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Open Web Wallet</span>
                    <svg className="w-3.5 h-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>

              {/* Step 2: Direct Action Card */}
              {isIssuancePhase ? (
                (() => {
                  const mimotoIssuerId = selectedIssuer?.id === 'certify-local'
                    ? 'Farmer'
                    : (selectedIssuer?.id === 'issuer-waltid'
                      ? 'WaltId'
                      : (selectedIssuer?.id === 'issuer-sphereon' ? 'Sphereon' : 'Playground'))
                  const targetCredId = selectedCredType?.id || selectedCredType?.credentialTypeName || 'PlaygroundIdentityCredential'
                  const rawOffer = new URL((offerUri || '').replace('openid-credential-offer://', 'http://dummy')).searchParams.get('credential_offer') || ''
                  const directWalletIssuanceUrl = `http://localhost:3004/user/issuers/${mimotoIssuerId}?credential_id=${encodeURIComponent(targetCredId)}&auto_download=true&credential_offer=${encodeURIComponent(rawOffer)}`

                  return (
                    <div className="rounded-xl bg-slate-950/70 border border-blue-500/25 p-3.5 space-y-3 shadow-sm">
                      <div className="flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-blue-300 px-2 py-0.5 rounded bg-blue-500/15 border border-blue-500/30">
                            Step 2
                          </span>
                          <span className="font-semibold text-white">Direct Credential Claim</span>
                        </div>
                        <span className="text-[11px] text-slate-400 font-mono">
                          {selectedIssuer?.name || 'Local Inji Certify'}
                        </span>
                      </div>

                      <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg">
                        <p className="text-[11px] text-slate-300 leading-relaxed">
                          Routes directly to <strong>{selectedIssuer?.name || 'Local Inji Certify'}</strong> and auto-selects <strong>{selectedCredType?.name || targetCredId}</strong>.
                        </p>
                      </div>

                      <a
                        href={directWalletIssuanceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-blue-600/20 flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <span>Open &amp; Directly Download in Web Wallet</span>
                        <svg className="w-4 h-4 text-blue-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  )
                })()
              ) : (
                <div className="rounded-xl bg-slate-950/70 border border-emerald-500/25 p-3.5 space-y-3 shadow-sm">
                  <div className="flex items-center justify-between text-[11px]">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-300 px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30">
                        Step 2
                      </span>
                      <span className="font-semibold text-white">Authorize Presentation</span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">Inji Verify</span>
                  </div>

                  <div className="bg-slate-900/80 border border-slate-800 p-2.5 rounded-lg">
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Select your credential in Inji Web and authorize presentation to Inji Verify.
                    </p>
                  </div>

                  <a
                    href={`http://localhost:3004/user/authorize?client_id=${encodeURIComponent(vpClientId || '')}&response_type=vp_token&response_mode=direct_post&request_uri=${encodeURIComponent((requestUri || '').replace(/localhost:3001|127\.0\.0\.1:3001/g, 'host.docker.internal:3001'))}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs sm:text-sm rounded-xl transition-all shadow-md shadow-emerald-600/20 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <span>Present from Local Web Wallet</span>
                    <svg className="w-4 h-4 text-emerald-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}
            </div>
          )}

          {/* Action Footer - exactly matching eSignet Modal footer */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onAbortTest}
              className="text-xs font-medium text-slate-400 hover:text-red-300 hover:bg-red-500/10 px-3.5 py-2 rounded-xl border border-slate-800 hover:border-red-500/30 transition-all cursor-pointer flex items-center gap-2"
              title="Abort this test run"
            >
              <svg className="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="currentColor">
                <rect x="5" y="5" width="14" height="14" rx="2" />
              </svg>
              <span>Abort Test</span>
            </button>

            {isIssuancePhase ? (
              <button
                type="button"
                onClick={onContinueVerification}
                disabled={isRunning || Boolean(vpRequestStep && vpRequestStep.status !== 'pending')}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs sm:text-sm font-semibold shadow-md shadow-blue-600/20 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                <span>{isRunning ? 'Processing...' : 'Proceed to Verification'}</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={onCheckVerificationResult}
                disabled={isRunning}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-semibold shadow-md shadow-emerald-600/20 transition-all cursor-pointer flex items-center gap-2 disabled:opacity-50"
              >
                <span>{isRunning ? 'Checking Result...' : 'Check Verification Result'}</span>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
