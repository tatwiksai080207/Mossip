import { useState, useCallback } from 'react'

// Dynamically import to avoid SSR issues
let OpenID4VPVerification: React.FC<any> | null = null
try {
  const sdk = require('@mosip/react-inji-verify-sdk')
  OpenID4VPVerification = sdk.OpenID4VPVerification
} catch {
  // SDK not available
}

interface VerifyResult {
  vc: Record<string, unknown>
  vcStatus: 'valid' | 'invalid' | 'expired'
}

interface Props {
  onResult?: (results: VerifyResult[]) => void
}

export default function InjiVerifyPanel({ onResult }: Props) {
  const [status, setStatus] = useState<'idle' | 'scanning' | 'result' | 'error'>('idle')
  const [results, setResults] = useState<VerifyResult[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleVPProcessed = useCallback((vpResults: VerifyResult[]) => {
    setResults(vpResults)
    setStatus('result')
    onResult?.(vpResults)
  }, [onResult])

  const handleError = useCallback((err: { errorMessage: string }) => {
    setError(err.errorMessage)
    setStatus('error')
  }, [])

  const handleQrExpired = useCallback(() => {
    setStatus('idle')
  }, [])

  if (!OpenID4VPVerification) {
    return (
      <div className="border border-slate-800 rounded-lg p-4">
        <h3 className="text-sm font-medium text-slate-300 mb-2">Inji Verify SDK</h3>
        <p className="text-xs text-slate-500">
          @mosip/react-inji-verify-sdk is not available. Install it with:
        </p>
        <code className="text-xs text-blue-400 block mt-1">
          npm install @mosip/react-inji-verify-sdk
        </code>
      </div>
    )
  }

  return (
    <div className="border border-slate-800 rounded-lg p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-300">VP Verification (Inji Verify SDK)</h3>
        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
          OpenID4VP
        </span>
      </div>

      {status === 'idle' && (
        <div>
          <p className="text-xs text-slate-500 mb-3">
            Scan the QR code with Inji Wallet to share your credential via OpenID4VP.
          </p>
          <OpenID4VPVerification
            verifyServiceUrl="https://api.collab.mosip.net/v1/verify"
            clientId="inji-playground"
            presentationDefinition={{
              purpose: 'Verify credential via Inji Playground',
              input_descriptors: [{
                id: 'credential-check',
                format: { ldp_vc: { proof_type: ['Ed25519Signature2020'] } },
                constraints: {},
              }],
            }}
            onVPProcessed={handleVPProcessed}
            onError={handleError}
            onQrCodeExpired={handleQrExpired}
            qrCodeStyles={{
              size: 200,
              bgColor: '#0f172a',
              fgColor: '#e2e8f0',
              margin: 2,
              borderRadius: 8,
            }}
          />
        </div>
      )}

      {status === 'result' && results && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-green-400">✓</span>
            <span className="text-sm text-slate-300">Verification Complete</span>
          </div>
          {results.map((r, i) => (
            <div key={i} className="mt-2 p-2 bg-slate-900 rounded text-xs">
              <div className={`font-medium ${
                r.vcStatus === 'valid' ? 'text-green-400' :
                r.vcStatus === 'expired' ? 'text-yellow-400' :
                'text-red-400'
              }`}>
                Status: {r.vcStatus.toUpperCase()}
              </div>
              <pre className="mt-1 text-slate-400 overflow-auto max-h-40">
                {JSON.stringify(r.vc, null, 2)}
              </pre>
            </div>
          ))}
          <button
            onClick={() => { setStatus('idle'); setResults(null) }}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300"
          >
            Scan again
          </button>
        </div>
      )}

      {status === 'error' && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-red-400">✗</span>
            <span className="text-sm text-red-300">Verification Failed</span>
          </div>
          <p className="text-xs text-slate-400">{error}</p>
          <button
            onClick={() => { setStatus('idle'); setError(null) }}
            className="mt-2 text-xs text-blue-400 hover:text-blue-300"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
