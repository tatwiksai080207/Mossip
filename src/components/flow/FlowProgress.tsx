import { useState, useEffect } from 'react'
import { useStore, evaluateTestRun } from '../../store/index'
import type { StepStatus } from '../../types'

function StatusBadge({ status, isCancelled }: { status: StepStatus; isCancelled: boolean }) {
  if (isCancelled) {
    return (
      <span className="w-5 h-5 rounded-full flex items-center justify-center bg-amber-500/10 text-amber-400 border border-amber-500/30 shrink-0">
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
        </svg>
      </span>
    )
  }
  switch (status) {
    case 'pending':
      return (
        <span className="w-5 h-5 rounded-full flex items-center justify-center bg-slate-800/60 text-slate-500 border border-slate-700/60 shrink-0">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />
        </span>
      )
    case 'running':
      return (
        <span className="w-5 h-5 rounded-full flex items-center justify-center bg-blue-500/10 text-blue-400 border border-blue-500/30 shrink-0">
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping" />
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
        <div className="flex items-center gap-2">
          {isTestActive && (
            <button
              onClick={abortTest}
              className="text-xs font-medium px-2.5 py-1 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/30 transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Abort running test"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
              <span>Abort Test</span>
            </button>
          )}
          {selectedStepId && (
            <button
              onClick={() => selectStep(null)}
              className="text-[11px] text-slate-400 hover:text-slate-200 px-2 py-0.5 rounded bg-slate-800 border border-slate-700 transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>
      </div>

      <div className="divide-y divide-slate-800/50">
        {steps.map((step) => {
          const isSelected = selectedStepId === step.id
          const isCancelled = Boolean((step.payload as any)?._cancelled)

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
                <StatusBadge status={step.status} isCancelled={isCancelled} />
                <span className={
                  isCancelled ? 'text-amber-300 font-medium' :
                  step.status === 'done' ? (isSelected ? 'text-sky-300 font-medium' : 'text-slate-300') :
                  step.status === 'running' ? 'text-white' :
                  step.status === 'error' ? 'text-red-300' :
                  'text-slate-500'
                }>
                  {step.label}
                  {isCancelled && <span className="ml-2 text-[10px] text-amber-400 font-normal border border-amber-400/30 bg-amber-400/10 px-1.5 py-0.5 rounded">Aborted</span>}
                </span>
              {step.status === 'running' && pausedStep !== step.id && (
                <div className="flex items-center gap-2 ml-auto">
                  <span className="text-xs text-blue-400">in progress</span>
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
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-slate-700/50 text-slate-500'
                    }`}>
                      {step.source as string}
                    </span>
                  )}
                  {!!step.payload && (
                    <svg
                      className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedStep === step.id ? 'rotate-90' : ''}`}
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
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                      {step.source as string}
                    </span>
                  )}
                  <span className="text-xs text-red-400">failed</span>
                  {!!step.payload && (
                    <svg
                      className={`w-3.5 h-3.5 text-slate-500 transition-transform ${expandedStep === step.id ? 'rotate-90' : ''}`}
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

      {!isRunning && !pausedStep && steps.some(s => s.status === 'done' || s.status === 'error') && (() => {
        const evaluation = evaluateTestRun(steps, runTamperMode)
        return (
          <div className="px-4 py-3 border-t border-slate-800">
            <div className={`text-sm ${evaluation.passed ? 'text-green-400' : 'text-red-400'}`}>
              <div className="font-semibold">{evaluation.passed ? 'Overall Status: PASS' : 'Overall Status: FAIL'}</div>
              <div className="mt-0.5">{evaluation.message}</div>
            </div>
            <div className="flex gap-3 mt-2 pt-2 border-t border-slate-800/50">
              <span className="text-xs text-green-500">{steps.filter(s => s.source === 'live').length} live</span>
              <span className="text-xs text-slate-500">{steps.filter(s => s.source === 'mock').length} mock</span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
