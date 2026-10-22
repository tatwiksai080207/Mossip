import React, { useState } from 'react'
import type { TestRun } from '../../types'

interface RunInspectorProps {
  run: TestRun
  onClose: () => void
}

const FORMAT_LABELS: Record<string, string> = {
  ldp_vc: 'W3C VC (JSON-LD)',
  'vc+sd-jwt': 'SD-JWT VC',
  mso_mdoc: 'ISO 18013-5 mDoc',
}

export const RunInspector: React.FC<RunInspectorProps> = ({ run, onClose }) => {
  const [expandedStepIndex, setExpandedStepIndex] = useState<number | null>(null)
  const [copiedPayloadIndex, setCopiedPayloadIndex] = useState<number | null>(null)

  const copyPayload = (index: number, payload: unknown) => {
    navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
    setCopiedPayloadIndex(index)
    setTimeout(() => setCopiedPayloadIndex(null), 1500)
  }

  const format = run.config.credentialType.format
  const durationSec = run.durationMs ? (run.durationMs / 1000).toFixed(2) : null
  const failedStep = run.steps.find((s) => s.status === 'error')

  return (
    <div className="h-full flex flex-col bg-slate-900/90 border-l border-slate-800/90 backdrop-blur-md overflow-hidden animate-fade-in select-text">
      {/* Inspector Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <span
            className={`font-bold px-2 py-0.5 rounded text-xs tracking-wider border ${
              run.result === 'pass'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : 'bg-red-500/15 text-red-300 border-red-500/30'
            }`}
          >
            {run.result.toUpperCase()}
          </span>
          <div>
            <h4 className="text-sm font-semibold text-white tracking-tight">Run Details</h4>
            <span className="text-[11px] text-slate-400 font-mono">
              {new Date(run.timestamp).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          title="Close Inspector"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Inspector Body (Scrollable) */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        {/* Run Metadata Grid */}
        <div className="grid grid-cols-2 gap-2.5 p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 text-xs">
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider block">
              Release Version
            </span>
            <span className="text-slate-200 font-mono mt-0.5 block">{run.version || 'v0.17.0 (Live)'}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider block">
              Format
            </span>
            <span className="text-slate-200 font-medium mt-0.5 block">{FORMAT_LABELS[format] || format}</span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider block">
              Proof Suite
            </span>
            <span className="text-slate-300 font-mono text-[11px] mt-0.5 block truncate">
              {run.config.credentialType.proofTypes.join(', ')}
            </span>
          </div>
          <div>
            <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider block">
              Duration
            </span>
            <span className="text-slate-200 font-mono mt-0.5 block">
              {durationSec ? `${durationSec}s` : '—'}
            </span>
          </div>
          <div className="col-span-2 pt-2 border-t border-slate-800/80">
            <span className="text-[10px] uppercase font-semibold text-slate-500 tracking-wider block">
              Lifecycle Route
            </span>
            <div className="text-slate-300 text-xs mt-1 flex flex-wrap items-center gap-1.5 font-medium">
              <span className="text-white">{run.config.issuer.name}</span>
              <span className="text-slate-600">→</span>
              <span className="text-white">{run.config.wallet.name}</span>
              <span className="text-slate-600">→</span>
              <span className="text-white">{run.config.verifier.name}</span>
            </div>
          </div>
        </div>

        {/* Diagnostic Failure Callout */}
        {run.result === 'fail' && (
          <div className="p-3.5 rounded-xl bg-red-950/30 border border-red-500/30 text-xs space-y-1.5">
            <div className="flex items-center gap-2 text-red-300 font-semibold">
              <svg className="w-4 h-4 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Interop Gap / Verification Failure</span>
            </div>
            <p className="text-red-200/90 text-[11px] leading-relaxed font-mono break-all">
              {failedStep?.payload
                ? typeof failedStep.payload === 'string'
                  ? failedStep.payload
                  : JSON.stringify(failedStep.payload)
                : 'Verification rejected or aborted by relying party.'}
            </p>
          </div>
        )}

        {/* Step-by-Step Protocol Trace */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h5 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
              Protocol Step Execution Trace ({run.steps.length} Steps)
            </h5>
          </div>

          <div className="space-y-1.5">
            {run.steps.map((st, idx) => {
              const isStepExpanded = expandedStepIndex === idx
              const hasPayload = st.payload !== undefined && st.payload !== null

              return (
                <div
                  key={idx}
                  className="rounded-lg border border-slate-800/80 bg-slate-950/40 overflow-hidden transition-colors"
                >
                  <div
                    onClick={() => hasPayload && setExpandedStepIndex(isStepExpanded ? null : idx)}
                    className={`px-3 py-2 flex items-center justify-between text-xs select-none ${
                      hasPayload ? 'cursor-pointer hover:bg-slate-900/50' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {st.status === 'done' ? (
                        <div className="w-4 h-4 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      ) : st.status === 'error' ? (
                        <div className="w-4 h-4 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center shrink-0">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </div>
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />
                      )}
                      <span className="text-slate-200 font-medium truncate">
                        {idx + 1}. {st.label}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {st.source && (
                        <span
                          className={`text-[9px] font-mono uppercase px-1.5 py-0.2 rounded border ${
                            st.source === 'live'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {st.source}
                        </span>
                      )}
                      <span
                        className={`text-[10px] font-mono font-semibold uppercase ${
                          st.status === 'done'
                            ? 'text-emerald-400'
                            : st.status === 'error'
                            ? 'text-red-400'
                            : 'text-slate-500'
                        }`}
                      >
                        {st.status}
                      </span>
                      {hasPayload && (
                        <svg
                          className={`w-3.5 h-3.5 text-slate-500 transition-transform ${
                            isStepExpanded ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Expandable Raw Payload Viewer */}
                  {isStepExpanded && hasPayload && (
                    <div className="p-3 bg-slate-950 border-t border-slate-800/80">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] uppercase font-mono text-slate-500 font-semibold">
                          Step Payload / Wire JSON
                        </span>
                        <button
                          onClick={() => copyPayload(idx, st.payload)}
                          className="text-[10px] text-blue-400 hover:text-blue-300 font-mono transition-colors cursor-pointer"
                        >
                          {copiedPayloadIndex === idx ? 'Copied!' : 'Copy JSON'}
                        </button>
                      </div>
                      <pre className="text-[11px] font-mono text-slate-300 bg-slate-900/90 p-2.5 rounded-lg border border-slate-800 overflow-x-auto max-h-56 leading-relaxed select-all">
                        {JSON.stringify(st.payload, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
