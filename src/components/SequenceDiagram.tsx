import { useStore } from '../store'
import type { StepStatus } from '../types'

// Each step maps to a message between two participants
const STEP_MESSAGES: { id: string; from: number; to: number; label: string }[] = [
  { id: 'issuer-metadata', from: 1, to: 0, label: 'Fetch .well-known Metadata' },
  { id: 'credential-offer', from: 0, to: 1, label: 'Credential Offer' },
  { id: 'token-exchange', from: 1, to: 0, label: 'Token Request → Response' },
  { id: 'credential-issuance', from: 0, to: 1, label: 'Issue Credential' },
  { id: 'vp-request', from: 2, to: 1, label: 'VP Authorization Request' },
  { id: 'vp-response', from: 1, to: 2, label: 'VP Token Response' },
  { id: 'verification', from: 2, to: 2, label: 'Verify Presentation' },
]

const PARTICIPANTS = ['Issuer', 'Wallet', 'Verifier']

function getColor(status: StepStatus) {
  switch (status) {
    case 'done': return { line: 'bg-green-500/50', text: 'text-green-400', arrow: 'text-green-400' }
    case 'running': return { line: 'bg-blue-500/50', text: 'text-blue-400', arrow: 'text-blue-400' }
    case 'error': return { line: 'bg-red-500/50', text: 'text-red-400', arrow: 'text-red-400' }
    default: return { line: 'bg-slate-700', text: 'text-slate-600', arrow: 'text-slate-600' }
  }
}

export default function SequenceDiagram() {
  const { steps, isRunning } = useStore()

  if (steps.length === 0) return null

  return (
    <div className="border border-slate-800 rounded-lg p-4">
      <h3 className="text-sm font-medium text-slate-300 mb-4">Protocol Sequence</h3>

      {/* Participant headers */}
      <div className="grid grid-cols-3 mb-3">
        {PARTICIPANTS.map((p) => (
          <div key={p} className="text-center">
            <span className="inline-block px-3 py-1.5 bg-slate-800 rounded text-xs font-medium text-slate-300">
              {p}
            </span>
          </div>
        ))}
      </div>

      {/* Messages */}
      <div className="relative">
        {/* Vertical lifelines */}
        <div className="grid grid-cols-3 absolute inset-0 pointer-events-none">
          {PARTICIPANTS.map((p) => (
            <div key={p} className="flex justify-center">
              <div className="w-px bg-slate-800/60 h-full" />
            </div>
          ))}
        </div>

        {/* Arrows */}
        <div className="relative space-y-0.5">
          {steps.map((step) => {
            const msg = STEP_MESSAGES.find(m => m.id === step.id)
            if (!msg) return null

            const colors = getColor(step.status)
            const isSelf = msg.from === msg.to
            const goesRight = msg.from < msg.to

            if (isSelf) {
              return (
                <div key={step.id} className="grid grid-cols-3 py-2">
                  {/* Empty cols before the participant */}
                  {Array.from({ length: msg.from }).map((_, i) => <div key={i} />)}
                  <div className="flex items-center justify-center">
                    <span className={`text-[11px] px-2 py-1 rounded border border-slate-700 ${colors.text}`}>
                      ↻ {msg.label}
                    </span>
                  </div>
                </div>
              )
            }

            const leftCol = Math.min(msg.from, msg.to)
            const rightCol = Math.max(msg.from, msg.to)

            return (
              <div key={step.id} className={`py-2.5 ${step.status === 'running' ? 'bg-slate-800/20 rounded' : ''}`}>
                <div className="flex items-center px-4">
                  {/* Label positioned on the sending side */}
                  <div className="flex-1 flex items-center" style={{
                    paddingLeft: `${(leftCol / 3) * 100}%`,
                    paddingRight: `${((2 - rightCol) / 3) * 100}%`,
                  }}>
                    {goesRight ? (
                      <div className="flex items-center w-full gap-1">
                        <span className={`text-[11px] shrink-0 ${colors.text}`}>{msg.label}</span>
                        <div className={`flex-1 h-px ${colors.line}`} />
                        <span className={`text-sm ${colors.arrow}`}>→</span>
                      </div>
                    ) : (
                      <div className="flex items-center w-full gap-1">
                        <span className={`text-sm ${colors.arrow}`}>←</span>
                        <div className={`flex-1 h-px ${colors.line}`} />
                        <span className={`text-[11px] shrink-0 ${colors.text}`}>{msg.label}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Legend */}
      {!isRunning && steps.some(s => s.status === 'done') && (
        <div className="mt-3 pt-3 border-t border-slate-800 flex gap-4 text-[10px] text-slate-500">
          <span>OpenID4VCI: steps 1–4</span>
          <span>OpenID4VP: steps 5–7</span>
        </div>
      )}
    </div>
  )
}
