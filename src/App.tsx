import { useEffect } from 'react'
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
    steps, isRunning, runFlow, resumeOAuthFlow, continueVerification, checkVerificationResult
  } = useStore()

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
      if (selectedVerifier?.env === 'local') {
        // Local verifier: the request_uri must be reachable by the phone.
        // We use a localhost.run tunnel (lhr.life) to avoid ngrok's browser warning intercept.
        const ngrokUrl = 'https://80281eb61ff907.lhr.life'
        requestUri = `${ngrokUrl}/v1/verify/vp-request/${requestId}`
        vpClientId = 'verify-service:8080/'
      } else {
        // Collab verifier: use its public URL directly — fully reachable by the phone.
        requestUri = `https://injiverify.collab.mosip.net/v1/verify/v2/vp-request/${requestId}`
        vpClientId = 'injiverify.collab.mosip.net/'
      }
    }
  }

  const vpRequestDeepLink = (requestUri && vpClientId)
    ? `openid4vp://authorize?client_id=${vpClientId}&request_uri=${encodeURIComponent(requestUri)}`
    : null
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Header />

      <main className="max-w-6xl mx-auto px-6 py-8">
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
        <div className="flex items-center justify-between border border-slate-800 rounded-lg px-4 py-3 mb-8">
          <div className="text-sm text-slate-400">
            {selectedIssuer?.name || '—'} → {selectedWallet?.name || '—'} → {selectedVerifier?.name || '—'}
            {selectedCredType && (
              <span className="ml-2 text-xs text-slate-500">({selectedCredType.name})</span>
            )}
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

        {steps.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <FlowProgress />
            <SequenceDiagram />
          </div>
        ) : (
          <FlowProgress />
        )}

        {isManualMode && offerUri && !vpRequestDeepLink && (
          <div className="mt-8 flex flex-col items-center justify-center p-8 border border-slate-800 rounded-lg bg-slate-900/50">
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

            <a 
              href={`http://localhost:3004/?credential_offer=${encodeURIComponent(new URL(offerUri.replace('openid-credential-offer://', 'http://dummy')).searchParams.get('credential_offer') || '')}`}
              target="_blank" rel="noreferrer"
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-medium rounded-lg transition-colors border border-slate-700"
            >
              Open in Local Web Wallet (Port 3004)
            </a>

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
            <h3 className="text-lg font-medium text-slate-200 mb-2">Manual Presentation QR Code</h3>
            <p className="text-sm text-slate-400 mb-6 text-center max-w-md">
              Scan this QR code using the official Inji Mobile App's "Share" tab to present your credential.
            </p>
            <div className="bg-white p-4 rounded-xl mb-6">
              <QRCode value={vpRequestDeepLink} size={256} />
            </div>
            
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
