import { useEffect, useState, useRef } from 'react'
import {
  Header,
  Sidebar,
  type NavTabId,
  RoleSelector,
  FlowProgress,
  TestReport,
  RunHistory,
  SequenceDiagram,
  InteropMatrix,
  InteractiveAuthModal,
  TamperBanner,
  ManualIssuanceSection,
  ManualPresentationSection,
  InteractiveWalletModal,
  ManualModePreRunBanner,
  InteropGapBanner,
} from './components'
import { useStore } from './store/index'

function App() {
  const {
    selectedIssuer, selectedWallet, selectedVerifier, selectedCredType,
    steps, isRunning, isTestActive, sessionStatus, runFlow, abortTest, resetTest, resumeOAuthFlow, continueVerification, checkVerificationResult,
    tamperMode, setTamperMode, history,
  } = useStore()

  const [activeTab, setActiveTab] = useState<NavTabId>('runner')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false)
  const [tunnelUrl, setTunnelUrl] = useState<string>('http://host.docker.internal:3001')
  const [diagramExpanded, setDiagramExpanded] = useState<boolean>(false)
  const executionSectionRef = useRef<HTMLDivElement>(null)

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

  let requestUri: string | null = null
  let vpClientId: string | null = null

  if (vpRequestStep?.status === 'done') {
    const requestId = (vpRequestStep.payload as any)?._response?.requestId as string | undefined

    if (requestId) {
      if (selectedVerifier?.id === 'verify-sphereon') {
        requestUri = `${tunnelUrl}/api/external/sphereon/verifier/v1/verify/vp-request/${requestId}`
        vpClientId = 'sphereon-verifier'
      } else if (selectedVerifier?.env === 'external') {
        requestUri = `${tunnelUrl}/api/external/waltid/verifier/v1/verify/vp-request/${requestId}`
        vpClientId = 'waltid-verifier'
      } else if (selectedVerifier?.env === 'local') {
        requestUri = `${tunnelUrl}/v1/verify/vp-request/${requestId}`
        vpClientId = 'localhost-verifier'
      } else {
        requestUri = `https://injiverify.collab.mosip.net/v1/verify/v2/vp-request/${requestId}`
        vpClientId = 'https://injiverify.collab.mosip.net'
      }
    }
  }

  const vpRequestDeepLink = (requestUri && vpClientId)
    ? `openid4vp://authorize?client_id=${encodeURIComponent(vpClientId)}&client_id_scheme=pre-registered&response_type=vp_token&response_mode=direct_post&request_uri=${encodeURIComponent(requestUri)}`
    : null

  const handleRunTest = () => {
    setActiveTab('runner')
    runFlow()
    setTimeout(() => {
      executionSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
  }

  return (
    <div className="min-h-screen bg-app-base text-app-text flex overflow-hidden transition-colors duration-200">
      {/* Collapsible Left Navigation Sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        tunnelUrl={tunnelUrl}
        isTestActive={isTestActive}
        totalRuns={history.length}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        <Header activeTab={activeTab} />

        <main className={`w-full px-4 sm:px-6 lg:px-8 py-6 flex-1 flex flex-col min-h-0 ${activeTab === 'runner' ? 'max-w-[1760px] mx-auto' : ''}`}>
          {/* TAB 1: Interop Studio */}
          {activeTab === 'runner' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-app-text-muted uppercase tracking-wider">Test Configuration</h3>
              </div>

              <RoleSelector />

              <ManualModePreRunBanner
                selectedWallet={selectedWallet}
                tunnelUrl={tunnelUrl}
                isRunning={isTestActive}
              />

              {/* Execution Summary & Control Bar */}
              <div className="flex flex-wrap items-center justify-between gap-4 border border-app-border rounded-xl px-5 py-3.5 bg-app-card shadow-sm backdrop-blur-sm">
                <div className="flex flex-wrap items-center gap-2 text-xs sm:text-sm text-app-text-secondary">
                  <span className="font-medium text-app-text">{selectedIssuer?.name || '—'}</span>
                  <span className="text-app-text-muted">→</span>
                  <span className="font-medium text-app-text">{selectedWallet?.name || '—'}</span>
                  <span className="text-app-text-muted">→</span>
                  <span className="font-medium text-app-text">{selectedVerifier?.name || '—'}</span>
                  {selectedCredType && (
                    <span className={`ml-2 px-2.5 py-0.5 rounded-full text-xs font-mono uppercase font-semibold border ${
                      selectedCredType.format === 'vc+sd-jwt'
                        ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
                        : selectedCredType.format === 'mso_mdoc'
                        ? 'bg-sky-500/15 text-sky-300 border-sky-500/30'
                        : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                    }`}>
                      {selectedCredType.format}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {/* Tamper & Negative Testing Mode Selector */}
                  <div className={`flex items-center gap-2 bg-app-base border rounded-xl px-3 py-1.5 transition-colors ${
                    isTestActive ? 'border-app-border/60 opacity-60' : 'border-app-border'
                  }`}>
                    <span className="text-xs text-app-text-muted font-medium flex items-center gap-1.5">
                      {isTestActive && (
                        <svg className="w-3.5 h-3.5 text-app-accent shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                      <span>Tamper Test:</span>
                    </span>
                    <select
                      value={tamperMode}
                      onChange={(e) => setTamperMode(e.target.value as any)}
                      disabled={isTestActive}
                      className={`bg-transparent text-xs text-app-text focus:outline-none ${isTestActive ? 'cursor-not-allowed text-app-text-muted' : 'cursor-pointer'}`}
                    >
                      <option value="none" className="bg-app-card text-app-text">Normal (Valid VP)</option>
                      <option value="signature" className="bg-app-card text-app-text">Corrupt Signature (Negative)</option>
                      <option value="expired" className="bg-app-card text-app-text">Malformed / Expired (Negative)</option>
                    </select>
                  </div>

                  {isTestActive ? (
                    <button
                      type="button"
                      onClick={abortTest}
                      className="px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold bg-rose-600 hover:bg-rose-500 text-white flex items-center gap-2 transition-all shadow-md shadow-rose-900/30 cursor-pointer animate-pulse-subtle"
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
                          className="px-3.5 py-2 rounded-xl text-xs font-medium bg-app-card hover:bg-app-card-hover text-app-text-secondary hover:text-app-text border border-app-border transition-colors cursor-pointer"
                          title="Clear diagram and reset test"
                        >
                          Reset
                        </button>
                      )}
                      <button
                        disabled={!canRun}
                        onClick={handleRunTest}
                        className={`px-5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-md ${
                          canRun
                            ? 'bg-app-accent text-white hover:bg-app-accent-hover shadow-app-accent/25 cursor-pointer'
                            : 'bg-app-card text-app-text-muted border border-app-border cursor-not-allowed'
                        }`}
                      >
                        Run Test
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <TamperBanner tamperMode={tamperMode} onReset={() => setTamperMode('none')} />

              {/* Prominent Interoperability Finding Banner on Protocol Gaps */}
              {flowHasRun && (
                <InteropGapBanner
                  steps={steps}
                  selectedCredType={selectedCredType}
                  selectedVerifier={selectedVerifier}
                  onResetTest={resetTest}
                />
              )}

              {/* Dynamic Step Progression and Sequence Diagram */}
              <div ref={executionSectionRef} className="scroll-mt-6">
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
                  <div className="border border-app-border rounded-2xl bg-app-card/40 p-8 text-center flex flex-col items-center justify-center">
                    <div className="w-10 h-10 rounded-xl bg-app-base border border-app-border text-app-text-muted flex items-center justify-center mb-3">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-medium text-app-text">Ready to Run</h3>
                    <p className="text-xs text-app-text-muted mt-1">
                      Select roles above and click <strong>Run Test</strong> to start
                    </p>
                  </div>
                )}
              </div>

              {/* Interactive Manual Sections (Inline on page) */}
              {isManualMode && isTestActive && (
                <div className="space-y-4">
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
                  <ManualPresentationSection
                    selectedWallet={selectedWallet}
                    vpRequestDeepLink={vpRequestDeepLink}
                    vpClientId={vpClientId}
                    requestUri={requestUri}
                    isRunning={isRunning}
                    onCheckVerificationResult={checkVerificationResult}
                  />
                </div>
              )}


              {/* Post-Run Test Report */}
              {flowHasRun && selectedIssuer && selectedWallet && selectedVerifier && selectedCredType && (
                <TestReport
                  issuer={selectedIssuer}
                  wallet={selectedWallet}
                  verifier={selectedVerifier}
                  credentialType={selectedCredType}
                  steps={steps}
                />
              )}
            </div>
          )}

          {/* TAB 2: Historical Regression Dashboard */}
          {activeTab === 'history' && (
            <div className="w-full flex-1 flex flex-col min-h-0">
              <RunHistory />
            </div>
          )}

          {/* TAB 3: Interoperability Matrix */}
          {activeTab === 'matrix' && (
            <div className="w-full flex-1 flex flex-col min-h-0 space-y-6">
              <InteropMatrix />
            </div>
          )}

          {/* Globally Mounted Interactive Modals (accessible across tabs, minimization persists) */}
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
    </div>
  )
}

export default App
