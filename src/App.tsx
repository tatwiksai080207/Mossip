import { useEffect, useState } from 'react'
import Header from './components/Header'
import RoleSelector from './components/RoleSelector'
import FlowProgress from './components/FlowProgress'
import TestReport from './components/TestReport'
import RunHistory from './components/RunHistory'
import SequenceDiagram from './components/SequenceDiagram'
import InjiVerifyPanel from './components/InjiVerifyPanel'
import InteropMatrix from './components/InteropMatrix'
import { useStore } from './store'
import QRCode from 'react-qr-code'

function App() {
  const {
    selectedIssuer, selectedWallet, selectedVerifier, selectedCredType,
    steps, isRunning, runFlow, resumeOAuthFlow, continueVerification, checkVerificationResult,
    tamperMode, setTamperMode,
  } = useStore()

  const [tunnelUrl, setTunnelUrl] = useState<string>('https://e6d4-119-161-98-68.ngrok-free.app')
  const [diagramExpanded, setDiagramExpanded] = useState<boolean>(false)

  useEffect(() => {
    fetch('/api/tunnel')
      .then(r => r.json())
      .then(d => {
        if (d?.tunnelUrl) setTunnelUrl(d.tunnelUrl)
      })
      .catch(() => {})
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

  const canRun = selectedIssuer && selectedWallet && selectedVerifier && selectedCredType && !isRunning
  const isManualMode = selectedWallet?.id === 'inji-web-manual' || selectedWallet?.id === 'inji-mobile'
  const flowHasRun = !isRunning && steps.length > 0 && steps.every(s => (s.status !== 'pending' || isManualMode) && s.status !== 'running')

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
        vpClientId = 'injiverify.collab.mosip.net/'
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

        {/* Summary + run */}
        <div className="flex flex-wrap items-center justify-between gap-4 border border-slate-800 rounded-lg px-4 py-3 mb-6 bg-slate-900/30">
          <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
            <span>{selectedIssuer?.name || '—'}</span>
            <span className="text-slate-600">→</span>
            <span>{selectedWallet?.name || '—'}</span>
            <span className="text-slate-600">→</span>
            <span>{selectedVerifier?.name || '—'}</span>
            {selectedCredType && (
              <span className={`ml-2 px-2 py-0.5 rounded text-xs font-mono uppercase font-semibold border ${
                selectedCredType.format === 'vc+sd-jwt'
                  ? 'bg-purple-500/20 text-purple-300 border-purple-500/30'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
              }`}>
                {selectedCredType.format} ({selectedCredType.name})
              </span>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Tamper & Negative Testing Mode Selector */}
            <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-md px-2.5 py-1.5">
              <span className="text-xs text-slate-400 font-medium">Tamper Test:</span>
              <select
                value={tamperMode}
                onChange={(e) => setTamperMode(e.target.value as any)}
                disabled={isRunning}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
              >
                <option value="none" className="bg-slate-900 text-slate-200">Normal (Valid VP)</option>
                <option value="signature" className="bg-slate-900 text-amber-300">Corrupt Signature (Negative)</option>
                <option value="expired" className="bg-slate-900 text-amber-300">Malformed / Expired (Negative)</option>
              </select>
            </div>

            <button
              disabled={!canRun}
              onClick={runFlow}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                canRun
                  ? 'bg-blue-600 text-white hover:bg-blue-500'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
              }`}
            >
              {isRunning ? 'Running...' : 'Run Test'}
            </button>
          </div>
        </div>

        {tamperMode !== 'none' && (
          <div className="mb-6 border border-amber-500/40 bg-amber-500/10 rounded-lg px-4 py-2.5 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold uppercase tracking-wider">
                Negative Testing Enabled
              </span>
              <span>Presentation will be deliberately modified ({tamperMode === 'signature' ? 'invalid cryptographic signature' : 'corrupted token payload'}) to verify rejection by Inji Verify.</span>
            </div>
            <button onClick={() => setTamperMode('none')} className="text-amber-400 hover:underline">Reset to Normal</button>
          </div>
        )}

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

        {isManualMode && offerUri && !vpRequestDeepLink && (
          <div className="mt-8 flex flex-col items-center justify-center p-8 border border-slate-800 rounded-lg bg-slate-900/50">
            {selectedWallet?.id === 'inji-mobile' ? (
              <>
                <h3 className="text-lg font-medium text-slate-200 mb-2">Manual Issuance QR Code</h3>
                <p className="text-sm text-slate-400 mb-6 text-center max-w-md">
                  Scan this QR code using the official Inji Mobile App.
                </p>
                <div className="bg-white p-4 rounded-xl mb-6">
                  <QRCode value={offerUri} size={256} />
                </div>
                
                <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-lg p-4 mb-4">
                  <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Raw Deep Link (For Copy/Pasting)</p>
                  <code className="text-xs text-green-400 break-all">{offerUri}</code>
                </div>

                <p className="text-sm text-slate-400 mb-4 text-center max-w-lg">
                  <strong className="text-slate-200">Where is the mobile app?</strong> Search for "Inji Wallet" on the Play Store/App Store, or download the APK directly from the <a href="https://github.com/mosip/inji/releases" target="_blank" rel="noreferrer" className="text-blue-400 hover:underline">MOSIP GitHub Releases</a>.
                </p>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium text-slate-200 mb-2">Web Wallet Issuance</h3>
                <p className="text-sm text-slate-400 mb-6 text-center max-w-md">
                  Directly download the credential offer into your local web wallet.
                </p>
                {(() => {
                  const mimotoIssuerId = selectedIssuer?.id === 'certify-local' 
                    ? 'Farmer' 
                    : (selectedIssuer?.id === 'certify-mock' 
                      ? 'MockMdl' 
                      : (selectedIssuer?.id === 'issuer-waltid' ? 'WaltId' : 'Playground'))
                  const targetCredId = selectedCredType?.id || selectedCredType?.credentialTypeName || 'PlaygroundIdentityCredential'
                  const rawOffer = new URL(offerUri.replace('openid-credential-offer://', 'http://dummy')).searchParams.get('credential_offer') || ''
                  const directWalletIssuanceUrl = `http://localhost:3004/user/issuers/${mimotoIssuerId}?credential_id=${encodeURIComponent(targetCredId)}&auto_download=true&credential_offer=${encodeURIComponent(rawOffer)}`
                  return (
                    <>
                      <div className="flex flex-col sm:flex-row items-center gap-3 mt-2 mb-3">
                        <a 
                          href={directWalletIssuanceUrl}
                          target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                        >
                          Open & Directly Download in Wallet (Port 3004)
                        </a>
                        <a 
                          href="http://localhost:3004"
                          target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-700"
                        >
                          Login / Unlock Wallet First
                        </a>
                      </div>
                      <p className="text-xs text-blue-400/90 mb-4 text-center max-w-lg bg-blue-500/10 border border-blue-500/20 px-3 py-1.5 rounded-md">
                        💡 <strong>Direct Flow:</strong> Routes directly to <strong>{selectedIssuer?.name || 'Playground Issuer'}</strong> and auto-selects <strong>{selectedCredType?.name || targetCredId}</strong> for download.
                      </p>
                    </>
                  )
                })()}
                <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-lg p-4 mb-4">
                  <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Raw Deep Link (For Copy/Pasting)</p>
                  <code className="text-xs text-green-400 break-all">{offerUri}</code>
                </div>
              </>
            )}

            {!vpRequestStep || vpRequestStep.status === 'pending' ? (
              <button
                onClick={continueVerification}
                disabled={isRunning}
                className="mt-6 px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
              >
                {isRunning ? 'Running...' : 'Proceed to Verification'}
              </button>
            ) : null}
          </div>
        )}

        {isManualMode && vpRequestDeepLink && (
          <div className="mt-4 flex flex-col items-center justify-center p-8 border border-slate-800 rounded-lg bg-slate-900/50">
            {selectedWallet?.id === 'inji-mobile' ? (
              <>
                <h3 className="text-lg font-medium text-slate-200 mb-2">Manual Presentation QR Code</h3>
                <p className="text-sm text-slate-400 mb-6 text-center max-w-md">
                  Scan this QR code using the official Inji Mobile App's "Share" tab to present your credential.
                </p>
                <div className="bg-white p-4 rounded-xl mb-6">
                  <QRCode value={vpRequestDeepLink} size={256} />
                </div>
              </>
            ) : (
              <>
                <h3 className="text-lg font-medium text-slate-200 mb-2">Web Wallet Presentation</h3>
                <p className="text-sm text-slate-400 mb-6 text-center max-w-md">
                  Present your credential directly using your local Inji Web wallet.
                </p>
                <div className="flex flex-col sm:flex-row items-center gap-3 mt-2 mb-3">
                  <a 
                    href={`http://localhost:3004/user/authorize?client_id=${encodeURIComponent(vpClientId || '')}&response_type=vp_token&response_mode=direct_post&request_uri=${encodeURIComponent(requestUri || '')}`}
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                  >
                    Present from Local Web Wallet (Port 3004)
                  </a>
                  <a 
                    href="http://localhost:3004"
                    target="_blank" rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg transition-colors border border-slate-700"
                  >
                    1. Open / Login to Wallet (Port 3004)
                  </a>
                </div>
                <p className="text-xs text-amber-400/90 mb-4 text-center max-w-lg bg-amber-500/10 border border-amber-500/20 px-3 py-1.5 rounded-md">
                  💡 <strong>Tip:</strong> Ensure you are signed in to your Inji Web wallet and have entered your 6-digit passcode before presenting.
                </p>
              </>
            )}
            
            <div className="w-full max-w-2xl bg-slate-950 border border-slate-800 rounded-lg p-4 mb-4">
              <p className="text-xs text-slate-400 mb-2 font-medium uppercase tracking-wider">Raw Deep Link (For Copy/Pasting)</p>
              <code className="text-xs text-blue-400 break-all">{vpRequestDeepLink}</code>
            </div>

            <button
              onClick={checkVerificationResult}
              disabled={isRunning}
              className="mt-2 px-6 py-2 bg-green-600 hover:bg-green-500 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {isRunning ? 'Checking...' : 'Check Verification Result'}
            </button>
          </div>
        )}

        {flowHasRun && steps.some(s => s.id === 'credential-issuance' && s.status === 'error') && (
          <div className="mt-4 border border-amber-500/30 bg-amber-500/5 rounded-lg px-4 py-3 flex gap-3">
            <span className="text-amber-400 text-lg leading-none mt-0.5">⚠</span>
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
      </main>
    </div>
  )
}

export default App
