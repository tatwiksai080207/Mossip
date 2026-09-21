import { useState, useEffect } from 'react'
import { useStore } from '../store'
import type { StepStatus, FlowStepInfo, IssuerConfig, VerifierConfig, CredentialType } from '../types'

function statusIcon(status: StepStatus) {
  switch (status) {
    case 'pending': return '○'
    case 'running': return '◌'
    case 'done': return '✓'
    case 'error': return '✗'
  }
}

function statusColor(status: StepStatus) {
  switch (status) {
    case 'pending': return 'text-slate-600'
    case 'running': return 'text-blue-400'
    case 'done': return 'text-green-400'
    case 'error': return 'text-red-400'
  }
}

function InfoTooltip({ title, description }: { title: string, description: string }) {
  return (
    <div className="relative group inline-flex items-center ml-2">
      <svg className="w-4 h-4 text-white cursor-help hover:text-slate-200 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      <div className="absolute right-0 bottom-full mb-2 w-80 p-3 bg-slate-800 border border-slate-700 rounded-lg shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 text-left cursor-default">
        <h4 className="text-sm font-semibold text-slate-200 mb-1.5">{title}</h4>
        <p className="text-xs text-slate-400 leading-relaxed whitespace-normal">{description}</p>
      </div>
    </div>
  )
}

function getKnownGap(step: FlowStepInfo, issuer: IssuerConfig | null, verifier: VerifierConfig | null, format: CredentialType | null) {
  if (!issuer || !verifier || !format) return null;

  console.log("getKnownGap evaluate:", { stepId: step.id, format: format.format, verifierId: verifier.id });

  if (step.id.includes('vp-request') && format.format.includes('mso_mdoc') && verifier.id.includes('inji-verify')) {
    console.log("MATCHED vp-request gap!");
    return {
      title: "DCQL Format Unsupported",
      description: "Inji Verify (COLLAB) uses the v2 DCQL specification, which strictly accepts only W3C formats (vc+sd-jwt, ldp_vp) and explicitly rejects mso_mdoc queries. Try testing this with Local Inji Verify instead, which uses standard OpenID4VP Presentation Exchange and fully supports mDocs!"
    }
  }
  
  if (step.id.includes('vp-response') && format.format.includes('mso_mdoc') && verifier.id.includes('inji-verify')) {
    console.log("MATCHED vp-response gap!");
    return {
      title: "Skipped (Upstream Failure)",
      description: "This step failed because the VP Authorization Request was rejected by the verifier. The wallet never received a valid request to respond to."
    }
  }

  if (step.id.includes('verification') && format.format.includes('mso_mdoc') && verifier.id.includes('inji-verify')) {
    console.log("MATCHED verification mdoc gap!");
    return {
      title: "Skipped (Upstream Failure)",
      description: "This step failed because the wallet never successfully submitted a VP Token Response."
    }
  }

  // All other known gaps happen at the verification step
  if (step.id !== 'verification') return null;
  
  if (format.format === 'vc+sd-jwt' && issuer.id === 'certify-playground' && (verifier.id === 'inji-verify' || verifier.id === 'verify-local')) {
    return {
      title: "Inji Verify strictly expects X.509 for SD-JWT",
      description: "Playground Issuer uses decentralized identifiers (did:key) to sign SD-JWTs natively, as permitted by the W3C. However, Inji Verify strictly expects an eIDAS-style X.509 certificate chain (x5c) for SD-JWTs and fails to resolve the DID. Try using the walt.id Verifier instead to see this exact credential verify successfully!"
    }
  }
  
  if (issuer.id === 'certify-playground' && (verifier.id === 'inji-verify' || verifier.id === 'verify-local')) {
    return {
      title: "Untrusted Issuer",
      description: "The Playground Issuer dynamically generates a new key pair each time it runs. This mock key is not present in Inji Verify's trusted issuer registry, causing the TrustedIssuerCheck to fail even if the signature is valid."
    }
  }

  if (issuer.id === 'certify-local' && verifier.id === 'inji-verify') {
    return {
      title: "Untrusted Local Issuer",
      description: "Local Inji Certify is running on your local machine and has its own local key. The remote Inji Verify (COLLAB) cloud server does not have this local key in its trusted issuer registry, causing the TrustedIssuerCheck to fail."
    }
  }

  return null;
}

export default function FlowProgress() {
  const { steps, isRunning, pausedStep, oauthUrl, selectedStepId, selectStep, selectedIssuer, selectedVerifier, selectedCredType } = useStore()
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  useEffect(() => {
    if (selectedStepId) {
      setExpandedStep(selectedStepId)
      const el = document.getElementById(`flow-step-${selectedStepId}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [selectedStepId])

  if (steps.length === 0) return null

  return (
    <div className="border border-slate-800 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-slate-300">Flow Progress</h3>
          <p className="text-xs text-slate-500 mt-0.5">Click a step or diagram arrow to inspect its payload</p>
        </div>
        {selectedStepId && (
          <button
            onClick={() => selectStep(null)}
            className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 transition-colors"
          >
            Clear selection
          </button>
        )}
      </div>

      <div className="divide-y divide-slate-800/50">
        {steps.map((step) => {
          const isSelected = selectedStepId === step.id
          const knownGap = step.status === 'error' ? getKnownGap(step, selectedIssuer, selectedVerifier, selectedCredType) : null
          return (
            <div
              key={step.id}
              id={`flow-step-${step.id}`}
              className={`transition-colors ${isSelected ? 'bg-sky-950/30 border-l-2 border-l-sky-400' : ''}`}
            >
              <button
                onClick={() => {
                  selectStep(expandedStep === step.id ? null : step.id)
                  if ((step.status === 'done' || step.status === 'error') && !!step.payload) {
                    setExpandedStep(expandedStep === step.id ? null : step.id)
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left ${
                  (step.status === 'done' || step.status === 'error') && !!step.payload ? 'cursor-pointer hover:bg-slate-800/30' : ''
                } ${step.status === 'running' ? 'bg-slate-800/20' : ''}`}
              >
                <span className={`font-mono text-base ${statusColor(step.status)} ${step.status === 'running' ? 'step-running' : ''}`}>
                  {statusIcon(step.status)}
                </span>
                <span className={
                  step.status === 'done' ? (isSelected ? 'text-sky-300 font-medium' : 'text-slate-300') :
                  step.status === 'running' ? 'text-white' :
                  step.status === 'error' ? 'text-red-300' :
                  'text-slate-500'
                }>
                  {step.label}
                </span>
              {step.status === 'running' && pausedStep !== step.id && (
                <span className="text-xs text-blue-400 ml-auto">in progress</span>
              )}
              {step.status === 'running' && pausedStep === step.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    if (oauthUrl) window.open(oauthUrl, 'eSignet Login', 'width=500,height=600')
                  }}
                  className="ml-auto text-xs font-medium px-2.5 py-1 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors"
                >
                  Login via eSignet
                </button>
              )}
              {step.status === 'done' && (
                <span className="flex items-center gap-2 ml-auto">
                  {step.source && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      step.source === 'live'
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-slate-700/50 text-slate-500'
                    }`}>
                      {step.source as string}
                    </span>
                  )}
                  {!!step.payload && (
                    <span className="text-xs text-slate-600">
                      {expandedStep === step.id ? '▾' : '▸'}
                    </span>
                  )}
                </span>
              )}
              {step.status === 'error' && (
                <span className="flex items-center gap-2 ml-auto">
                  {step.source && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                      {step.source as string}
                    </span>
                  )}
                  <InfoTooltip title={knownGap ? knownGap.title : `Debug: ${selectedIssuer?.id} | ${selectedVerifier?.id} | ${selectedCredType?.format} | ${step.id}`} description={knownGap ? knownGap.description : "No gap matched."} />
                  <span className="text-xs text-red-400">failed</span>
                  {!!step.payload && (
                    <span className="text-xs text-slate-600">
                      {expandedStep === step.id ? '▾' : '▸'}
                    </span>
                  )}
                </span>
              )}
            </button>

            {expandedStep === step.id && !!step.payload && (
              <div className="px-4 pb-3">
                <div className="border border-slate-800 rounded-md bg-slate-900 overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/60 border-b border-slate-800 text-[11px] text-slate-400">
                    <span className="font-mono">Payload Preview</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigator.clipboard.writeText(JSON.stringify(step.payload, null, 2))
                      }}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors text-[10px]"
                    >
                      Copy JSON
                    </button>
                  </div>
                  <pre className="p-3 text-xs text-slate-400 overflow-x-auto overflow-y-auto max-h-72 font-mono leading-relaxed">
                    {JSON.stringify(step.payload as Record<string, unknown>, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>

      {!isRunning && steps.some(s => s.status === 'done' || s.status === 'error') && (
        <div className="px-4 py-3 border-t border-slate-800">
          <div className={`text-sm ${
            steps.every(s => s.status === 'done') ? 'text-green-400' : 'text-yellow-400'
          }`}>
            {steps.every(s => s.status === 'done')
              ? 'All steps completed successfully'
              : `${steps.filter(s => s.status === 'done').length}/${steps.length} steps passed, ${steps.filter(s => s.status === 'error').length} failed`
            }
          </div>
          <div className="flex gap-3 mt-1">
            <span className="text-xs text-green-500">{steps.filter(s => s.source === 'live').length} live</span>
            <span className="text-xs text-slate-500">{steps.filter(s => s.source === 'mock').length} mock</span>
          </div>
        </div>
      )}
    </div>
  )
}
