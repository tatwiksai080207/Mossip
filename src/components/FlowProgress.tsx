import { useState } from 'react'
import { useStore } from '../store'
import type { StepStatus } from '../types'

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

export default function FlowProgress() {
  const { steps, isRunning } = useStore()
  const [expandedStep, setExpandedStep] = useState<string | null>(null)

  if (steps.length === 0) return null

  return (
    <div className="border border-slate-800 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-800">
        <h3 className="text-sm font-medium text-slate-300">Flow Progress</h3>
        <p className="text-xs text-slate-500 mt-0.5">Click a completed step to inspect its payload</p>
      </div>

      <div className="divide-y divide-slate-800/50">
        {steps.map((step) => (
          <div key={step.id}>
            <button
              onClick={() => {
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
                step.status === 'done' ? 'text-slate-300' :
                step.status === 'running' ? 'text-white' :
                step.status === 'error' ? 'text-red-300' :
                'text-slate-500'
              }>
                {step.label}
              </span>
              {step.status === 'running' && (
                <span className="text-xs text-blue-400 ml-auto">in progress</span>
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
                  <span className="text-xs text-red-400">failed</span>
                  {!!step.payload && (
                    <span className="text-xs text-slate-600">
                      {expandedStep === step.id ? '▾' : '▸'}
                    </span>
                  )}
                </span>
              )}
            </button>

            {expandedStep === step.id && !!step.payload && (() => {
              const p = step.payload as Record<string, unknown>
              return (
                <div className="px-4 pb-3">
                  <pre className="bg-slate-900 border border-slate-800 rounded-md p-3 text-xs text-slate-400 overflow-x-auto font-mono leading-relaxed">
                    {JSON.stringify(p, null, 2)}
                  </pre>
                </div>
              )
            })()}
          </div>
        ))}
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
