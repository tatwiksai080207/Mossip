import React, { useState, useEffect } from 'react'
import QRCode from 'react-qr-code'
import type { IssuerConfig, WalletConfig, CredentialType, FlowStepInfo } from '../../types'

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
  onContinueVerification: () => void
  onCheckVerificationResult: () => void
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
  onContinueVerification,
  onCheckVerificationResult,
}) => {
  const [isOpen, setIsOpen] = useState(true)
  const [copied, setCopied] = useState(false)

  // Re-open modal whenever a new interactive step becomes active
  useEffect(() => {
    if (offerUri || vpRequestDeepLink) {
      setIsOpen(true)
      setCopied(false)
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

  if (!isIssuancePhase && !isPresentationPhase) return null

  const activeUri = isIssuancePhase ? offerUri : vpRequestDeepLink

  const handleCopy = () => {
    if (!activeUri) return
    navigator.clipboard.writeText(activeUri)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Floating Minimized Button
  if (!isOpen) {
    return (
      <aside
        aria-label="Pending interactive action"
        className="fixed bottom-6 right-6 z-50 animate-bounce"
      >
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-medium text-sm rounded-full shadow-2xl border border-blue-400/40 cursor-pointer transition-all hover:scale-105"
        >
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
          <span>{isIssuancePhase ? 'Action Required: Scan Issuance QR' : 'Action Required: Scan Presentation QR'}</span>
          <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
        </button>
      </aside>
    )
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="interactive-wallet-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fade-in"
    >
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-scale-up">
        {/* Modal Header */}
        <div className={`p-4 sm:p-5 flex items-center justify-between border-b ${
          isIssuancePhase ? 'border-blue-500/20 bg-blue-950/30' : 'border-emerald-500/20 bg-emerald-950/30'
        }`}>
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${
              isIssuancePhase
                ? 'bg-blue-500/20 border-blue-500/40 text-blue-300'
                : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
            }`}>
              {isIssuancePhase ? (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  isIssuancePhase
                    ? 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                }`}>
                  {isIssuancePhase ? 'Step 1 of 2 · Credential Issuance' : 'Step 2 of 2 · Verification & Presentation'}
                </span>
                <span className="text-xs text-slate-400 font-medium">
                  {selectedWallet?.name || 'Manual Wallet'}
                </span>
              </div>
              <h3 id="interactive-wallet-title" className="text-base sm:text-lg font-semibold text-slate-100 mt-0.5">
                {isIssuancePhase ? 'Scan or Claim Your Credential' : 'Present Credential for Verification'}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors cursor-pointer"
            title="Minimize modal (Escape)"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {selectedWallet?.id === 'inji-mobile' ? (
            /* Inji Mobile QR Flow */
            <div className="flex flex-col items-center text-center">
              <p className="text-xs sm:text-sm text-slate-300 mb-4 max-w-md">
                {isIssuancePhase
                  ? 'Open your Inji Mobile App and scan this QR code to download and store the Verifiable Credential.'
                  : "In your Inji Mobile App, switch to the 'Share' tab and scan this QR code to present your credential."}
              </p>

              {activeUri && (
                <div className="bg-white p-4 sm:p-5 rounded-2xl shadow-xl border-4 border-slate-700/50 mb-4 transition-transform hover:scale-[1.02]">
                  <QRCode value={activeUri} size={220} />
                </div>
              )}

              {/* Raw Deep Link Box */}
              <div className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex flex-col gap-1.5 text-left">
                <div className="flex items-center justify-between text-[11px] text-slate-400 font-medium">
                  <span className="uppercase tracking-wider">Raw Protocol Deep Link</span>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-blue-400 hover:text-blue-300 font-semibold cursor-pointer transition-colors"
                  >
                    {copied ? (
                      <>
                        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        <span className="text-emerald-400">Copied!</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                        </svg>
                        <span>Copy for Emulator</span>
                      </>
                    )}
                  </button>
                </div>
                <code className="text-[11px] font-mono text-emerald-400/90 break-all bg-slate-900/60 p-2 rounded-lg select-all">
                  {activeUri}
                </code>
              </div>

              {/* Inji App Download Note */}
              <p className="text-[11px] text-slate-400/80 mt-3 text-center">
                Need the app? Download the official APK from{' '}
                <a
                  href="https://github.com/mosip/inji/releases"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-400 hover:underline"
                >
                  MOSIP GitHub Releases
                </a>
                .
              </p>
            </div>
          ) : (
            /* Inji Web Wallet Flow */
            <div className="flex flex-col items-center text-center">
              <p className="text-xs sm:text-sm text-slate-300 mb-4 max-w-md">
                {isIssuancePhase
                  ? 'Click below to open your local Inji Web container and claim the credential.'
                  : 'Click below to authenticate and present your credential to Inji Verify.'}
              </p>

              {isIssuancePhase ? (
                (() => {
                  const mimotoIssuerId = selectedIssuer?.id === 'certify-local'
                    ? 'Farmer'
                    : (selectedIssuer?.id === 'issuer-waltid' ? 'WaltId' : 'Playground')
                  const targetCredId = selectedCredType?.id || selectedCredType?.credentialTypeName || 'PlaygroundIdentityCredential'
                  const rawOffer = new URL((offerUri || '').replace('openid-credential-offer://', 'http://dummy')).searchParams.get('credential_offer') || ''
                  const directWalletIssuanceUrl = `http://localhost:3004/user/issuers/${mimotoIssuerId}?credential_id=${encodeURIComponent(targetCredId)}&auto_download=true&credential_offer=${encodeURIComponent(rawOffer)}`
                  return (
                    <div className="w-full flex flex-col items-center gap-3">
                      <a
                        href={directWalletIssuanceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-medium text-sm rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2"
                      >
                        <span>Open &amp; Directly Download in Web Wallet (Port 3004)</span>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                      <a
                        href="http://localhost:3004"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-slate-400 hover:text-slate-200 underline"
                      >
                        1. Unlock / Login to Web Wallet first
                      </a>
                      <p className="text-xs text-blue-400/90 text-center max-w-lg bg-blue-500/10 border border-blue-500/20 px-3 py-2 rounded-lg mt-2">
                        💡 <strong>Direct Flow:</strong> Routes directly to <strong>{selectedIssuer?.name || 'Playground Issuer'}</strong> and auto-selects <strong>{selectedCredType?.name || targetCredId}</strong>.
                      </p>
                    </div>
                  )
                })()
              ) : (
                <div className="w-full flex flex-col items-center gap-3">
                  <a
                    href={`http://localhost:3004/user/authorize?client_id=${encodeURIComponent(vpClientId || '')}&response_type=vp_token&response_mode=direct_post&request_uri=${encodeURIComponent((requestUri || '').replace(/localhost:3001|127\.0\.0\.1:3001/g, 'host.docker.internal:3001'))}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-sm rounded-xl transition-colors shadow-lg flex items-center justify-center gap-2"
                  >
                    <span>Present from Local Web Wallet (Port 3004)</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  <a
                    href="http://localhost:3004"
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-slate-400 hover:text-slate-200 underline"
                  >
                    1. Open / Login to Web Wallet first
                  </a>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 sm:p-5 bg-slate-950/70 border-t border-slate-800 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setIsOpen(false)}
            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-2 rounded-lg hover:bg-slate-800/80 transition-colors cursor-pointer"
          >
            Minimize &amp; View Diagram
          </button>

          {isIssuancePhase ? (
            <button
              type="button"
              onClick={onContinueVerification}
              disabled={isRunning || Boolean(vpRequestStep && vpRequestStep.status !== 'pending')}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{isRunning ? 'Processing...' : 'Proceed to Verification'}</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={onCheckVerificationResult}
              disabled={isRunning}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <span>{isRunning ? 'Checking Result...' : 'Check Verification Result'}</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
