import { useState, useCallback } from 'react'

import { OpenID4VPVerification } from '@mosip/react-inji-verify-sdk'

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


  return (
    <div className="border border-app-border rounded-xl p-4 bg-app-card/40 backdrop-blur-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-app-text">VP Verification (Inji Verify SDK)</h3>
        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-app-accent-subtle text-app-accent border border-app-border-focus">
          OpenID4VP
        </span>
      </div>

      {status === 'idle' && (
        <div>
          <p className="text-xs text-app-text-muted mb-3">
            Scan the QR code with Inji Wallet to share your credential via OpenID4VP.
          </p>
          <OpenID4VPVerification
            verifyServiceUrl="http://localhost:3001/api/mock-verifier"
            clientId="did:web:inji-verify.collab.mosip.net"
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
              bgColor: 'transparent',
              fgColor: 'currentColor',
              margin: 2,
              borderRadius: 8,
            }}
          />
        </div>
      )}

      {status === 'result' && results && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-app-text">Verification Complete</span>
          </div>
          {results.map((r, i) => (
            <div key={i} className="mt-2 p-2.5 bg-app-base border border-app-border rounded-lg text-xs">
              <div className={`font-medium ${
                r.vcStatus === 'valid' ? 'text-emerald-400' :
                r.vcStatus === 'expired' ? 'text-app-warning' :
                'text-rose-400'
              }`}>
                Status: {r.vcStatus.toUpperCase()}
              </div>
              <pre className="mt-1 text-app-text-secondary overflow-auto max-h-40 font-mono text-[11px]">
                {JSON.stringify(r.vc, null, 2)}
              </pre>
            </div>
          ))}
          <button
            onClick={() => { setStatus('idle'); setResults(null) }}
            className="mt-2 text-xs text-app-accent hover:underline cursor-pointer"
          >
            Scan again
          </button>
        </div>
      )}

      {status === 'error' && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-4 h-4 text-rose-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
            <span className="text-sm text-rose-300">Verification Failed</span>
          </div>
          <p className="text-xs text-app-text-muted">{error}</p>
          <button
            onClick={() => { setStatus('idle'); setError(null) }}
            className="mt-2 text-xs text-app-accent hover:underline cursor-pointer"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  )
}
