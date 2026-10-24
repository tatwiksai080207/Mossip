import React from 'react'
import type { FlowStepInfo, CredentialType, VerifierConfig } from '../../types'
import { verifiers, appLinks } from '../../config'
import { useStore } from '../../store'

interface InteropGapBannerProps {
  steps: FlowStepInfo[]
  selectedCredType: CredentialType | null
  selectedVerifier: VerifierConfig | null
  onResetTest?: () => void
}

export const InteropGapBanner: React.FC<InteropGapBannerProps> = ({
  steps,
  selectedCredType,
  selectedVerifier,
  onResetTest,
}) => {
  const { selectVerifier } = useStore()

  // Find any step with an error and inspect its payload
  const failedStep = steps.find((s) => s.status === 'error')
  if (!failedStep) return null

  const payload = (typeof failedStep.payload === 'object' && failedStep.payload !== null)
    ? (failedStep.payload as Record<string, unknown>)
    : null

  const findingText = String(payload?._interop_finding || '')
  const rawError = String(payload?._error || JSON.stringify(payload) || '')

  // Determine finding category
  const isMdocGap =
    selectedCredType?.format === 'mso_mdoc' &&
    (findingText.includes('Finding #7') ||
      findingText.includes('mso_mdoc') ||
      rawError.includes('doctype_values') ||
      rawError.includes('InvalidVpTokenException') ||
      failedStep.id === 'verification' ||
      failedStep.id === 'vp-request')

  const isSdJwtGap =
    selectedCredType?.format === 'vc+sd-jwt' &&
    (findingText.includes('Finding #3') ||
      findingText.includes('x5c') ||
      rawError.includes('x5c') ||
      rawError.includes('ERR_SIGNATURE_VERIFICATION_FAILED'))

  const isEsignetTokenGap =
    failedStep.id === 'credential-issuance' &&
    (rawError.includes('OAuth') ||
      rawError.includes('eSignet') ||
      rawError.includes('OTP') ||
      findingText.includes('Finding 1'))

  if (!isMdocGap && !isSdJwtGap && !isEsignetTokenGap && !findingText) {
    return null
  }

  const handleSwitchToWaltId = () => {
    const waltIdVerif = verifiers.find((v) => v.id === 'verify-waltid')
    if (waltIdVerif) {
      selectVerifier(waltIdVerif)
      if (onResetTest) onResetTest()
    }
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-app-border bg-app-card/95 shadow-2xl backdrop-blur-xl">
      {/* Sleek top ambient accent line */}
      <div className="h-[2px] w-full bg-gradient-to-r from-app-accent via-app-accent/40 to-transparent" />
      <div className="absolute top-0 left-0 w-80 h-32 bg-app-accent/5 blur-3xl pointer-events-none -z-10" />

      {/* Main Content Area */}
      <div className="p-5 sm:p-6 space-y-4">
        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-app-accent-subtle border border-app-border-focus text-app-accent flex items-center justify-center shrink-0 shadow-inner">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-app-accent-subtle text-app-accent border border-app-border-focus">
                  {isMdocGap && 'Finding #7 · Interoperability Gap'}
                  {isSdJwtGap && 'Finding #3 · Trust Model Gap'}
                  {isEsignetTokenGap && 'Finding #1 · Auth Boundary'}
                  {!isMdocGap && !isSdJwtGap && !isEsignetTokenGap && 'Protocol Boundary'}
                </span>
                <span className="text-[11px] font-mono text-app-text-muted px-2 py-0.5 rounded-full bg-app-base/60 border border-app-border">
                  Step: {failedStep.label || failedStep.id}
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-semibold text-app-text tracking-tight mt-1">
                {isMdocGap && 'Upstream Specification Gap: ISO/IEC 18013-5 mDoc Parser in Inji Verify'}
                {isSdJwtGap && 'Upstream Trust Model Gap: Enterprise X.509 (x5c) Requirement'}
                {isEsignetTokenGap && 'Authentication Requirement: Interactive eSignet Login Mandated'}
                {!isMdocGap && !isSdJwtGap && !isEsignetTokenGap && 'Protocol Boundary Finding'}
              </h4>
            </div>
          </div>

          {/* Upstream Status Pill */}
          <div className="self-start sm:self-auto shrink-0">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono bg-app-base/80 border border-app-border text-app-text shadow-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-app-accent animate-pulse" />
              {isMdocGap && 'Planned v0.18.0+'}
              {isSdJwtGap && 'x5c Enforcement'}
              {isEsignetTokenGap && 'Collab eSignet OIDC'}
              {!isMdocGap && !isSdJwtGap && !isEsignetTokenGap && 'Documented Gap'}
            </span>
          </div>
        </div>

        {/* Structured Technical Context Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
          <div className="p-3.5 rounded-xl bg-app-base/60 border border-app-border text-xs space-y-1">
            <span className="text-[10px] uppercase font-semibold text-app-text-muted tracking-wider block">
              Observed Behavior
            </span>
            <p className="text-app-text-secondary leading-relaxed">
              {isMdocGap && (
                <>
                  The wallet constructed and presented an authentic <strong>ISO/IEC 18013-5 mDoc</strong> presentation via OpenID4VP <code>direct_post</code> to <strong>{selectedVerifier?.name || 'Inji Verify'}</strong>.
                </>
              )}
              {isSdJwtGap && (
                <>
                  The wallet presented a standard <strong>IETF SD-JWT VC</strong> signed with decentralized <code>did:key</code> to Inji Verify.
                </>
              )}
              {isEsignetTokenGap && (
                <>
                  Headless token exchange was attempted against Collab Inji Certify without an interactive session.
                </>
              )}
            </p>
          </div>

          <div className="p-3.5 rounded-xl bg-app-base/60 border border-app-border text-xs space-y-1">
            <span className="text-[10px] uppercase font-semibold text-app-text-muted tracking-wider block">
              Upstream Root Cause
            </span>
            <p className="text-app-text-secondary leading-relaxed">
              {isMdocGap && (
                <>
                  Inji Verify 0.17 container throws <code className="text-app-accent font-mono text-[11px] font-semibold">InvalidVpTokenException</code> in <code className="text-app-text-muted font-mono text-[11px]">VerifiablePresentationSubmissionServiceImpl.java:88</code>. Native mDoc parsing is scheduled for <strong>v0.18.0+</strong>.
                </>
              )}
              {isSdJwtGap && (
                <>
                  Inji Verify strictly validates an X.509 certificate chain (<code className="text-app-accent font-mono text-[11px] font-semibold">x5c</code>) in the JWT header, rejecting decentralized DID public key resolution.
                </>
              )}
              {isEsignetTokenGap && (
                <>
                  Collab sandbox mandates OAuth 2.0 Authorization Code flow with dynamic human email OTP verification.
                </>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Classy Action Footer */}
      <div className="px-5 py-3.5 bg-app-base/40 border-t border-app-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {(isMdocGap || isSdJwtGap) && selectedVerifier?.id !== 'verify-waltid' && (
            <button
              onClick={handleSwitchToWaltId}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-app-accent hover:bg-app-accent-hover text-white shadow-md shadow-black/20 transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Switch to walt.id Verifier &amp; Re-test</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          )}

          <span className="text-[11px] text-app-text-muted hidden sm:inline">
            {isMdocGap && 'Validates cross-ecosystem OpenID4VP interoperability without vendor lock-in.'}
            {isSdJwtGap && 'Natively resolves did:key public keys without mandatory x5c.'}
          </span>
        </div>

        <a
          href={appLinks.injiDocsRoadmap}
          target="_blank"
          rel="noopener noreferrer"
          className="px-3 py-1.5 rounded-lg text-xs font-medium text-app-text-muted hover:text-app-text hover:bg-app-card border border-transparent hover:border-app-border transition-all flex items-center gap-1.5"
        >
          <span>MOSIP Verification Roadmap</span>
          <svg className="w-3 h-3 text-app-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
        </a>
      </div>
    </div>
  )
}
export default InteropGapBanner
