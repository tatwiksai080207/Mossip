import type { FlowStepInfo, IssuerConfig, WalletConfig, VerifierConfig, CredentialType } from '../types'

interface Props {
  issuer: IssuerConfig
  wallet: WalletConfig
  verifier: VerifierConfig
  credentialType: CredentialType
  steps: FlowStepInfo[]
}

export default function TestReport({ issuer, wallet, verifier, credentialType, steps }: Props) {
  const allPassed = steps.every(s => s.status === 'done')
  const failedSteps = steps.filter(s => s.status === 'error')

  return (
    <div className="border border-slate-800 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">Test Report</h3>
        <span className={`text-xs font-medium px-2 py-0.5 rounded ${
          allPassed
            ? 'bg-green-500/10 text-green-400'
            : 'bg-red-500/10 text-red-400'
        }`}>
          {allPassed ? 'PASS' : 'FAIL'}
        </span>
      </div>

      <div className="p-4 space-y-4">
        {/* Configuration used */}
        <div>
          <p className="text-xs text-slate-500 mb-2">Configuration</p>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-800/50">
              <tr>
                <td className="py-1.5 text-slate-500 w-32">Issuer</td>
                <td className="py-1.5 text-slate-300">{issuer.name}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-500">Wallet</td>
                <td className="py-1.5 text-slate-300">{wallet.name}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-500">Verifier</td>
                <td className="py-1.5 text-slate-300">{verifier.name}</td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-500">Format</td>
                <td className="py-1.5">
                  <span className={`text-xs font-medium px-1.5 py-0.5 rounded ${
                    credentialType.format === 'vc+sd-jwt'
                      ? 'bg-purple-500/10 text-purple-400'
                      : 'bg-green-500/10 text-green-400'
                  }`}>
                    {credentialType.name}
                  </span>
                </td>
              </tr>
              <tr>
                <td className="py-1.5 text-slate-500">Proof Type</td>
                <td className="py-1.5 text-slate-300 font-mono text-xs">{credentialType.proofTypes.join(', ')}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Step results */}
        <div>
          <p className="text-xs text-slate-500 mb-2">Step Results</p>
          <div className="space-y-1">
            {steps.map((step, i) => (
              <div key={step.id} className="flex items-center justify-between px-3 py-2 rounded-md bg-slate-900/50 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 text-xs w-4">{i + 1}.</span>
                  <span className="text-slate-300">{step.label}</span>
                </div>
                <span className={`text-xs font-medium ${
                  step.status === 'done' ? 'text-green-400' :
                  step.status === 'error' ? 'text-red-400' :
                  'text-slate-500'
                }`}>
                  {step.status === 'done' ? 'pass' : step.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Failure details */}
        {failedSteps.length > 0 && (
          <div className="border border-amber-500/20 rounded-md p-3 bg-amber-500/5">
            <p className="text-xs text-amber-400 font-medium mb-1">Failed Steps (Interoperability Gaps)</p>
            {failedSteps.map(s => (
              <p key={s.id} className="text-xs text-amber-300">✗ {s.label}</p>
            ))}
            <p className="text-xs text-slate-500 mt-2">
              These failures represent real interoperability gaps discovered during testing against the
              MOSIP Collab sandbox. See <span className="font-mono">INTEROPERABILITY_REPORT.md</span> for details.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
