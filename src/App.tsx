import { useEffect, useState } from 'react'
import {
  Header,
  RoleSelector,
  FlowProgress,
  TestReport,
  RunHistory,
  SequenceDiagram,
  InjiVerifyPanel,
  InteropMatrix,
  InteractiveAuthModal,
  TamperBanner,
  ManualIssuanceSection,
  ManualPresentationSection,
  InteractiveWalletModal,
  ManualModePreRunBanner,
} from './components'
import { useStore } from './store/index'


function App() {
  const {
    selectedIssuer, selectedWallet, selectedVerifier, selectedCredType,
    steps, isRunning, isTestActive, sessionStatus, runFlow, abortTest, resetTest, resumeOAuthFlow, continueVerification, checkVerificationResult,
    tamperMode, setTamperMode,
  } = useStore()

  const [tunnelUrl, setTunnelUrl] = useState<string>('http://host.docker.internal:3001')
  const [diagramExpanded, setDiagramExpanded] = useState<boolean>(false)

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isTestActive) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isTestActive])

  useEffect(() => {
    fetch('/api/tunnel')
      .then(r => r.json())
      .then(d => {
        if (d?.tunnelUrl) setTunnelUrl(String(d.tunnelUrl).trim())
      })
      .catch(() => { })
  }, [])

  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'oauth-code' && e.data.code) {
        resumeOAuthFlow(e.data.code)
      }
    }
    window.addEventListener('message', handleMessage)
    return () => window.removeEventListener('message', handleMessage)
  }, [resumeOAuthFlow])

  useEffect(() => {
    // Only connect WebSocket in the main window, not the callback popup
    if (window.location.pathname === '/callback') return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'network_event') {
          useStore.getState().addNetworkEvent(data)
        }
      } catch { }
    }
    
    return () => ws.close()
  }, [])

  if (window.location.pathname === '/callback') {
    const code = new URLSearchParams(window.location.search).get('code')
    if (code) {
      if (window.opener) {
        window.opener.postMessage({ type: 'oauth-code', code }, '*')
        window.close()
      }
      return <div className="p-10 text-white font-mono">Authenticating... You can close this window.</div>
    }
    return <div className="p-10 text-red-400 font-mono">Authentication failed: No code provided.</div>
  }

  const canRun = selectedIssuer && selectedWallet && selectedVerifier && selectedCredType && !isTestActive
  const isManualMode = selectedWallet?.id === 'inji-wallet-interactive' || selectedWallet?.id === 'inji-web-manual' || selectedWallet?.id === 'inji-mobile'
  const flowHasRun = !isTestActive && steps.length > 0 && (sessionStatus === 'completed' || sessionStatus === 'failed' || (!isManualMode && steps.every(s => s.status !== 'pending' && s.status !== 'running')))

  const offerStep = steps.find(s => s.id === 'credential-offer')
  const offerUri = offerStep?.status === 'done' ? (offerStep.payload as Record<string, unknown>)?._offer_uri as string : null

  const vpRequestStep = steps.find(s => s.id === 'vp-request')

  // Build the request_uri and client_id for the presentation deep link.
  // The wallet validates that client_id in the QR matches client_id in the signed JWT
  // returned by the request_uri endpoint — so both must come from the same verifier.
  let requestUri: string | null = null
  let vpClientId: string | null = null

  if (vpRequestStep?.status === 'done') {
    const requestId = (vpRequestStep.payload as any)?._response?.requestId as string | undefined

    if (requestId) {
      if (selectedVerifier?.env === 'external') {
        requestUri = `${tunnelUrl}/api/external/waltid/verifier/v1/verify/vp-request/${requestId}`
        vpClientId = 'waltid-verifier'
      } else if (selectedVerifier?.env === 'local') {
        // Local verifier tunnel (OpenID4VP mandates https with a domain name)
        requestUri = `${tunnelUrl}/v1/verify/vp-request/${requestId}`
        vpClientId = 'localhost-verifier'
      } else {
        // Collab verifier: use its public URL directly — fully reachable by the phone.
        requestUri = `https://injiverify.collab.mosip.net/v1/verify/v2/vp-request/${requestId}`
        vpClientId = 'https://injiverify.collab.mosip.net'
      }
    }
  }

  const vpRequestDeepLink = (requestUri && vpClientId)
    ? `openid4vp://authorize?client_id=${encodeURIComponent(vpClientId)}&response_type=vp_token&response_mode=direct_post&request_uri=${encodeURIComponent(requestUri)}`
    : null
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Header />

      <main className="max-w-[1720px] mx-auto px-4 sm:px-8 py-8">
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-1">Test Configuration</h2>
          <p className="text-sm text-slate-400">
            Select an issuer, wallet, and verifier to run a credential lifecycle test.
          </p>
        </div>

        <div className="mb-8">
          <RoleSelector />
        </div>

        <ManualModePreRunBanner
          selectedWallet={selectedWallet}
          tunnelUrl={tunnelUrl}
          isRunning={isTestActive}
        />

        {/* Summary + run */}
        <div className="flex flex-wrap items-center justify-between gap-4 border border-slate-800 rounded-lg px-4 py-3 mb-6 bg-slate-900/30">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span>{selectedIssuer?.name || '—'}</span>
            <span className="text-slate-600">→</span>
            <span>{selectedWallet?.name || '—'}</span>
            <span className="text-slate-600">→</span>
            <span>{selectedVerifier?.name || '—'}</span>
            {selectedCredType && (
              <span className={`ml-2 px-2 py-0.5 rounded text-xs font-mono uppercase font-semibold border ${selectedCredType.format === 'vc+sd-jwt'
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                }`}>
                {selectedCredType.format} ({selectedCredType.name})
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Tamper & Negative Testing Mode Selector */}
            <div className={`flex items-center gap-2 bg-slate-900 border rounded-md px-2.5 py-1.5 transition-colors ${
              isTestActive ? 'border-slate-800/60 opacity-60' : 'border-slate-800'
            }`}>
              <span className="text-xs text-slate-400 font-medium flex items-center gap-1">
                {isTestActive && (
                  <svg className="w-3 h-3 text-amber-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
                Tamper Test:
              </span>
              <select
                value={tamperMode}
                onChange={(e) => setTamperMode(e.target.value as any)}
                disabled={isTestActive}
                className={`bg-transparent text-xs text-slate-200 focus:outline-none ${isTestActive ? 'cursor-not-allowed text-slate-400' : 'cursor-pointer'}`}
              >
                <option value="none" className="bg-slate-900 text-slate-200">Normal (Valid VP)</option>
                <option value="signature" className="bg-slate-900 text-amber-300">Corrupt Signature (Negative)</option>
                <option value="expired" className="bg-slate-900 text-amber-300">Malformed / Expired (Negative)</option>
              </select>
            </div>

            {isTestActive ? (
              <button
                type="button"
                onClick={abortTest}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 hover:bg-red-500 text-white flex items-center gap-2 transition-all shadow-md hover:shadow-red-900/30 cursor-pointer animate-pulse-subtle"
                title="Abort current test run and unlock configuration"
              >
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="5" y="5" width="14" height="14" rx="2" />
                </svg>
                <span>Abort Test</span>
              </button>
            ) : (
              <div className="flex items-center gap-2">
                {steps.length > 0 && (
                  <button
                    type="button"
                    onClick={resetTest}
                    className="px-3 py-2 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
                    title="Clear diagram and reset test"
                  >
                    Reset
                  </button>
                )}
                <button
                  disabled={!canRun}
                  onClick={runFlow}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${canRun
                      ? 'bg-blue-600 text-white hover:bg-blue-500 cursor-pointer'
                      : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                    }`}
                >
                  Run Test
                </button>
              </div>
            )}
          </div>
        </div>

        <TamperBanner tamperMode={tamperMode} onReset={() => setTamperMode('none')} />

        {steps.length > 0 ? (
          diagramExpanded ? (
            <div className="space-y-6">
              <SequenceDiagram isExpanded={diagramExpanded} onToggleExpand={() => setDiagramExpanded(false)} />
              <FlowProgress />
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              <div className="xl:col-span-4 order-2 xl:order-1">
                <FlowProgress />
              </div>
              <div className="xl:col-span-8 order-1 xl:order-2">
                <SequenceDiagram isExpanded={diagramExpanded} onToggleExpand={() => setDiagramExpanded(true)} />
              </div>
            </div>
          )
        ) : (
          <FlowProgress />
        )}

        {isManualMode && isTestActive && (
          <ManualIssuanceSection
            selectedWallet={selectedWallet}
            selectedIssuer={selectedIssuer}
            selectedCredType={selectedCredType}
            offerUri={offerUri}
            vpRequestDeepLink={vpRequestDeepLink}
            vpRequestStep={vpRequestStep}
            isRunning={isRunning}
            onContinueVerification={continueVerification}
          />
        )}

        {isManualMode && isTestActive && (
          <ManualPresentationSection
            selectedWallet={selectedWallet}
            vpRequestDeepLink={vpRequestDeepLink}
            vpClientId={vpClientId}
            requestUri={requestUri}
            isRunning={isRunning}
            onCheckVerificationResult={checkVerificationResult}
          />
        )}


        {flowHasRun && steps.some(s => s.id === 'credential-issuance' && s.status === 'error') && (
          <div className="mt-4 border border-amber-500/30 bg-amber-500/5 rounded-lg px-4 py-3 flex gap-3">
            <div className="w-5 h-5 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 mt-0.5">
              <svg className="w-3.5 h-3.5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-amber-300">Interoperability Gap Discovered</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Step 4 (Credential Issuance) requires an OAuth access token from eSignet, which mandates
                an interactive login with a dynamic email OTP. Automated &amp; headless issuance is not
                supported by the Collab sandbox. Steps 1–3 completed with live data. Steps 5–7 continue
                with mock data to demonstrate the full protocol flow.{' '}
                <a href="https://github.com" className="text-amber-400 underline" target="_blank" rel="noopener noreferrer">
                  See INTEROPERABILITY_REPORT.md
                </a>
              </p>
            </div>
          </div>
        )}

        {/* Inji Verify SDK - OpenID4VP QR verification */}
        {flowHasRun && !isManualMode && (
          <div className="mt-6">
            <InjiVerifyPanel />
          </div>
        )}

        {flowHasRun && selectedIssuer && selectedWallet && selectedVerifier && selectedCredType && (
          <div className="mt-6">
            <TestReport
              issuer={selectedIssuer}
              wallet={selectedWallet}
              verifier={selectedVerifier}
              credentialType={selectedCredType}
              steps={steps}
            />
          </div>
        )}

        <div className="mt-6">
          <RunHistory />
        </div>

        <div className="mt-6">
          <InteropMatrix />
        </div>

        <InteractiveAuthModal />

        {isManualMode && (
          <InteractiveWalletModal
            selectedWallet={selectedWallet}
            selectedIssuer={selectedIssuer}
            selectedCredType={selectedCredType}
            offerUri={offerUri}
            vpRequestDeepLink={vpRequestDeepLink}
            vpRequestStep={vpRequestStep}
            vpClientId={vpClientId}
            requestUri={requestUri}
            isRunning={isRunning}
            isTestActive={isTestActive}
            onContinueVerification={continueVerification}
            onCheckVerificationResult={checkVerificationResult}
            onAbortTest={abortTest}
          />
        )}
      </main>
    </div>
  )
}

export default App
