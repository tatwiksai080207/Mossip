import { useState, useEffect } from 'react'
import { useStore, evaluateTestRun } from '../../store/index'
import type { StepStatus } from '../../types'

function StatusBadge({ status, isCancelled }: { status: StepStatus; isCancelled: boolean }) {
  if (isCancelled) {
    return (
      <span className="w-5 h-5 rounded-full flex items-center justify-center bg-app-card text-app-text-muted border border-app-border shrink-0">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      </span>
    )
  }
  switch (status) {
    case 'pending':
      return (
        <span className="w-5 h-5 rounded-full flex items-center justify-center bg-app-card text-app-text-muted border border-app-border shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-app-text-muted" />
        </span>
      )
    case 'running':
      return (
        <span className="w-5 h-5 rounded-full flex items-center justify-center bg-app-accent-subtle text-app-accent border border-app-border-focus shrink-0">
          <span className="w-2 h-2 rounded-full bg-app-accent animate-ping" />
        </span>
      )
    case 'done':
      return (
        <span className="w-5 h-5 rounded-full flex items-center justify-center bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shrink-0">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
      )
    case 'error':
      return (
        <span className="w-5 h-5 rounded-full flex items-center justify-center bg-red-500/10 text-red-400 border border-red-500/30 shrink-0">
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      )
  }
}

export default function FlowProgress() {
  const { steps, isRunning, isTestActive, pausedStep, oauthUrl, selectedStepId, selectStep, runTamperMode, abortTest } = useStore()
  const [expandedStep, setExpandedStep] = useState<string | null>(null)
  const [copiedStepId, setCopiedStepId] = useState<string | null>(null)

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
    <div className="border border-app-border rounded-lg bg-app-card/30">
      <div className="px-4 py-3 border-b border-app-border flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-app-text">Flow Progress</h3>
          <p className="text-xs text-app-text-muted mt-0.5">Click a step or diagram arrow to inspect its payload</p>
        </div>
        <div className="flex items-center gap-2">
          {isTestActive && (
            <button
              onClick={abortTest}
              className="text-xs font-medium px-2.5 py-1 rounded bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Abort running test"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
              <span>Abort Test</span>
            </button>
          )}
          {selectedStepId && (
            <button
              onClick={() => selectStep(null)}
              className="text-[11px] text-app-text-muted hover:text-app-text px-2 py-0.5 rounded bg-app-card hover:bg-app-card-hover border border-app-border transition-colors cursor-pointer"
            >
              Clear selection
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-app-border/50">
        {steps.map((step) => {
          const isSelected = selectedStepId === step.id
          const isCancelled = Boolean((step.payload as any)?._cancelled)

          return (
            <div
              key={step.id}
              id={`flow-step-${step.id}`}
              className={`transition-colors ${isSelected ? 'bg-app-accent-subtle border-l-2 border-l-app-accent' : ''}`}
            >
              <button
                onClick={() => {
                  selectStep(expandedStep === step.id ? null : step.id)
                  if ((step.status === 'done' || step.status === 'error') && !!step.payload) {
                    setExpandedStep(expandedStep === step.id ? null : step.id)
                  }
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left ${
                  (step.status === 'done' || step.status === 'error') && !!step.payload ? 'cursor-pointer hover:bg-app-card-hover/40' : ''
                } ${step.status === 'running' ? 'bg-app-card/30' : ''}`}
              >
                <StatusBadge status={step.status} isCancelled={isCancelled} />
                <span className={
                  isCancelled ? 'text-app-text-muted font-medium' :
                  step.status === 'done' ? (isSelected ? 'text-app-accent font-medium' : 'text-app-text-secondary') :
                  step.status === 'running' ? 'text-app-text' :
                  step.status === 'error' ? 'text-rose-300' :
                  'text-app-text-muted'
                }>
                  {step.label}
                  {isCancelled && <span className="ml-2 text-[10px] text-app-text-muted font-normal border border-app-border bg-app-base px-1.5 py-0.5 rounded">Aborted</span>}
                </span>
              {step.status === 'running' && pausedStep !== step.id && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-app-accent">in progress</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      abortTest()
                    }}
                    className="text-[11px] font-medium px-2 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors cursor-pointer"
                    title="Abort this test"
                  >
                    Abort
                  </button>
                </div>
              )}
              {step.status === 'running' && pausedStep === step.id && (
                <div className="flex items-center gap-1.5 ml-auto">
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      if (oauthUrl) window.open(oauthUrl, 'eSignet Login', 'width=540,height=700')
                    }}
                    className="text-xs font-medium px-2.5 py-1 rounded bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors cursor-pointer"
                  >
                    Login via eSignet
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      abortTest()
                    }}
                    className="text-xs font-medium px-2 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors cursor-pointer"
                    title="Abort this test"
                  >
                    Abort
                  </button>
                </div>
              )}
              {step.status === 'done' && (
                <span className="flex items-center gap-2 ml-auto">
                  {step.source && (
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${
                      step.source === 'live'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-app-card text-app-text-muted border border-app-border'
                    }`}>
                      {step.source as string}
                    </span>
                  )}
                  {!!step.payload && (
                    <svg
                      className={`w-3.5 h-3.5 text-app-text-muted transition-transform ${expandedStep === step.id ? 'rotate-90' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </span>
              )}
              {step.status === 'error' && (
                <span className="flex items-center gap-2 ml-auto">
                  {step.source && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400">
                      {step.source as string}
                    </span>
                  )}
                  <span className="text-xs text-rose-400">failed</span>
                  {!!step.payload && (
                    <svg
                      className={`w-3.5 h-3.5 text-app-text-muted transition-transform ${expandedStep === step.id ? 'rotate-90' : ''}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  )}
                </span>
              )}
            </button>

            {expandedStep === step.id && !!step.payload && (
              <div className="px-4 pb-3">
                <div className="border border-app-border rounded-md bg-app-base overflow-hidden">
                  <div className="flex items-center justify-between px-3 py-1.5 bg-app-card/60 border-b border-app-border text-[11px] text-app-text-muted">
                    <span className="font-mono">Payload Preview</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        navigator.clipboard.writeText(JSON.stringify(step.payload, null, 2))
                        setCopiedStepId(step.id)
                        setTimeout(() => setCopiedStepId(null), 2000)
                      }}
                      className="px-2 py-0.5 rounded bg-app-card hover:bg-app-card-hover text-app-text-muted hover:text-app-text border border-app-border transition-colors text-[10px] cursor-pointer flex items-center gap-1 font-medium shadow-2xs"
                    >
                      {copiedStepId === step.id ? (
                        <>
                          <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                          <span className="text-emerald-400">Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                          </svg>
                          <span>Copy JSON</span>
                        </>
                      )}
                    </button>
                  </div>
                  <pre className="p-3 text-xs text-app-text-secondary overflow-x-auto overflow-y-auto max-h-72 font-mono leading-relaxed">
                    {JSON.stringify(step.payload as Record<string, unknown>, null, 2)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>

      {!isRunning && !pausedStep && steps.some(s => s.status === 'done' || s.status === 'error') && (() => {
        const evaluation = evaluateTestRun(steps, runTamperMode)
        return (
          <div className="px-4 py-3 border-t border-app-border">
            <div className={`text-sm ${evaluation.passed ? 'text-emerald-400' : 'text-rose-400'}`}>
              <div className="font-semibold">{evaluation.passed ? 'Overall Status: PASS' : 'Overall Status: FAIL'}</div>
              <div className="mt-0.5">{evaluation.message}</div>
            </div>
            <div className="flex gap-3 mt-2 pt-2 border-t border-app-border/50">
              <span className="text-xs text-emerald-400">{steps.filter(s => s.source === 'live').length} live</span>
              <span className="text-xs text-app-text-muted">{steps.filter(s => s.source === 'mock').length} mock</span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
