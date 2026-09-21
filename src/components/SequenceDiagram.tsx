import { useState, useEffect, useRef } from 'react'
import mermaid from 'mermaid'
import { useStore } from '../store'
import type { FlowStep, FlowStepInfo, StepStatus, NetworkEvent } from '../types'

interface SequenceDiagramProps {
  isExpanded?: boolean
  onToggleExpand?: () => void
}

function initMermaid(isExpanded: boolean = false) {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
      darkMode: true,
      background: 'transparent',
      primaryColor: '#1e293b',
      primaryTextColor: '#f8fafc',
      primaryBorderColor: '#334155',
      lineColor: '#64748b',
      secondaryColor: '#0f172a',
      tertiaryColor: '#1e293b',
      noteBkgColor: '#1e293b',
      noteTextColor: '#cbd5e1',
      noteBorderColor: '#475569',
      actorBkg: '#0f172a',
      actorBorder: '#38bdf8',
      actorTextColor: '#f8fafc',
      actorLineColor: '#334155',
      signalColor: '#64748b',
      signalTextColor: '#94a3b8',
      labelBoxBkgColor: '#1e293b',
      labelBoxBorderColor: '#334155',
      labelTextColor: '#f8fafc',
      loopTextColor: '#cbd5e1',
      activationBorderColor: '#38bdf8',
      activationBkgColor: '#0369a1',
      sequenceNumberColor: '#38bdf8',
    },
    sequence: {
      showSequenceNumbers: true,
      actorMargin: isExpanded ? 150 : 100,
      messageMargin: 38,
      boxMargin: 10,
      boxTextMargin: 6,
      noteMargin: 12,
      useMaxWidth: false,
    },
    securityLevel: 'loose',
  })
}

function sanitizeName(name: string): string {
  return name.replace(/[^\w\s-]/g, '').trim() || 'Entity'
}

function mapTextToStep(text: string): FlowStep | null {
  const lower = text.toLowerCase()
  if (lower.includes('metadata')) return 'issuer-metadata'
  if (lower.includes('offer')) return 'credential-offer'
  if (lower.includes('token request')) return 'token-exchange'
  if (lower.includes('issue credential') || lower.includes('stored')) return 'credential-issuance'
  if (lower.includes('authorization request') || lower.includes('vp authorization')) return 'vp-request'
  if (lower.includes('vp token') || lower.includes('direct post') || lower.includes('tampered payload')) return 'vp-response'
  if (lower.includes('verif') || lower.includes('cryptographic') || lower.includes('integrity check') || lower.includes('status:')) return 'verification'
  return null
}

function generateFullFlowDSL(params: {
  issuerName: string
  walletName: string
  verifierName: string
  credFormat: string
  steps: FlowStepInfo[]
  tamperMode: string
  networkEvents: NetworkEvent[]
}): string {
  const { issuerName, walletName, verifierName, credFormat, steps, tamperMode, networkEvents } = params

  const getStepStatus = (id: FlowStep) => steps.find(s => s.id === id)?.status || 'pending'
  const getIcon = (st: StepStatus) => {
    if (st === 'done') return ' ✓'
    if (st === 'running') return ' ◌ [Active]'
    if (st === 'error') return ' ✗ [Failed]'
    return ''
  }

  const s1 = getStepStatus('issuer-metadata')
  const s2 = getStepStatus('credential-offer')
  const s3 = getStepStatus('token-exchange')
  const s4 = getStepStatus('credential-issuance')
  const s5 = getStepStatus('vp-request')
  const s6 = getStepStatus('vp-response')
  const s7 = getStepStatus('verification')

  const cleanIssuer = sanitizeName(issuerName)
  const cleanWallet = sanitizeName(walletName)
  const cleanVerifier = sanitizeName(verifierName)

  let dsl = `sequenceDiagram
  autonumber
  participant I as ${cleanIssuer}
  participant W as ${cleanWallet}
  participant V as ${cleanVerifier}

  rect rgb(15, 23, 42)
  Note over I,W: Phase 1: OpenID4VCI (Credential Issuance)
  W->>I: 1. Fetch Metadata (.well-known)${getIcon(s1)}
  I-->>W: 2. Credential Offer (${credFormat})${getIcon(s2)}
  W->>I: 3. Token Request (OAuth / DPoP)${getIcon(s3)}
  I-->>W: 4. Issue Credential Payload${getIcon(s4)}
  end
`
  if (s4 === 'done') {
    dsl += `  Note over W: Credential Securely In Wallet (${credFormat})\n`
  }

  dsl += `
  rect rgb(15, 23, 42)
  Note over W,V: Phase 2: OpenID4VP (Presentation & Verification)
  V->>W: 5. VP Authorization Request (DCQL)${getIcon(s5)}
`
  if (tamperMode !== 'none') {
    dsl += `  Note over W,V: [Negative Test] ${tamperMode === 'signature' ? 'Mutated Signature' : 'Corrupted Token'}\n`
    if (s6 === 'done' || s6 === 'running') {
      dsl += `  W-->>V: 6. Send Tampered VP Token${getIcon(s6)}\n`
    } else {
      dsl += `  W-->>V: 6. VP Token Response${getIcon(s6)}\n`
    }
    if (s7 === 'done') {
      dsl += `  V->>V: 7. Presentation Rejected (Test Passed ✓)\n`
    } else if (s7 === 'error') {
      dsl += `  V-xV: 7. Verification Failed (Negative Assertion Met ✓)\n`
    } else {
      dsl += `  V->>V: 7. Cryptographic Verification & Tamper Check${getIcon(s7)}\n`
    }
  } else {
    dsl += `  W-->>V: 6. VP Token Response (Holder Binding)${getIcon(s6)}\n`
    if (s7 === 'done') {
      dsl += `  V->>V: 7. Verification Success (Signature & Claims Valid ✓)\n`
    } else if (s7 === 'error') {
      dsl += `  V-xV: 7. Verification Failed ✗\n`
    } else {
      dsl += `  V->>V: 7. Verify Signature & Status List${getIcon(s7)}\n`
    }
  }
  dsl += `  end\n`

  if (networkEvents && networkEvents.length > 0) {
    dsl += `\n  rect rgb(30, 41, 59)\n  Note over I,V: Live Network Trace\n`
    networkEvents.forEach(evt => {
      let from = 'I'
      let to = 'V'
      if (evt.url.includes('verify')) { from = 'W'; to = 'V' }
      else if (evt.url.includes('wallet')) { from = 'V'; to = 'W' }
      else { from = 'W'; to = 'I' }
      
      const cleanPath = evt.path || new URL(evt.url).pathname
      dsl += `  ${from}->>${to}: ${evt.method} ${cleanPath} [${evt.status}] ⏱${evt.latencyMs}ms 📦${evt.payloadSize}\n`
    })
    dsl += `  end\n`
  }

  return dsl
}

function generateVpFocusedDSL(params: {
  walletName: string
  verifierName: string
  credFormat: string
  steps: FlowStepInfo[]
  tamperMode: string
}): string {
  const { walletName, verifierName, credFormat, steps, tamperMode } = params
  const s5 = steps.find(s => s.id === 'vp-request')?.status || 'pending'
  const s6 = steps.find(s => s.id === 'vp-response')?.status || 'pending'
  const s7 = steps.find(s => s.id === 'verification')?.status || 'pending'

  const cleanWallet = sanitizeName(walletName)
  const cleanVerifier = sanitizeName(verifierName)

  const getIcon = (st: StepStatus) => {
    if (st === 'done') return ' ✓'
    if (st === 'running') return ' ◌ [Active]'
    if (st === 'error') return ' ✗ [Failed]'
    return ''
  }

  let dsl = `sequenceDiagram
  autonumber
  participant V as ${cleanVerifier}
  participant W as ${cleanWallet}
  participant C as Crypto & VP Engine

  rect rgb(15, 23, 42)
  Note over V,C: OpenID4VP Protocol Exchange (Task #3)
  V->>W: 1. Authorization Request (request_uri & DCQL)${getIcon(s5)}
  Note over W: Parse DCQL query & match format (${credFormat})
  
  W->>C: 2. Request Selective Disclosures & Nonce Binding
  C-->>W: 3. Return Signed VP Token & Disclosures (${credFormat})
`
  if (tamperMode !== 'none') {
    dsl += `  Note over W,C: [Negative Test] Corrupted ${tamperMode}
  W->>V: 4. Direct Post VP Token (Tampered Payload)${getIcon(s6)}
  V->>C: 5. Verify Cryptographic Integrity
  C-->>V: 6. Integrity Check: INVALID (Tamper Detected)${getIcon(s7)}
`
  } else {
    dsl += `  W->>V: 4. Direct Post VP Token Response${getIcon(s6)}
  V->>C: 5. Verify Cryptographic Signature & Issuer Trust
  C-->>V: 6. Status: Presentation Valid & Revocation Checked ✓${getIcon(s7)}
`
  }
  dsl += `  end\n`

  return dsl
}

export default function SequenceDiagram({ isExpanded = false, onToggleExpand }: SequenceDiagramProps = {}) {
  const {
    steps,
    isRunning,
    selectedIssuer,
    selectedWallet,
    selectedVerifier,
    selectedCredType,
    tamperMode,
    selectedStepId,
    selectStep,
    networkEvents,
  } = useStore()

  const [viewMode, setViewMode] = useState<'full' | 'openid4vp' | 'code'>('full')
  const [copied, setCopied] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const issuerName = selectedIssuer?.name || 'Issuer'
  const walletName = selectedWallet?.name || 'Wallet'
  const verifierName = selectedVerifier?.name || 'Verifier'
  const credFormat = selectedCredType?.format || 'vc+sd-jwt'

  const mermaidDSL = viewMode === 'openid4vp'
    ? generateVpFocusedDSL({ walletName, verifierName, credFormat, steps, tamperMode })
    : generateFullFlowDSL({
        issuerName,
        walletName,
        verifierName,
        credFormat,
        steps,
        tamperMode,
        networkEvents,
      })

  useEffect(() => {
    initMermaid(isExpanded)
  }, [isExpanded])

  // Render Mermaid diagram whenever state or view mode changes
  useEffect(() => {
    if (viewMode === 'code' || !containerRef.current) return

    let isMounted = true
    const uniqueId = `mermaid-svg-${Date.now()}`

    setRenderError(null)
    initMermaid(isExpanded)

    mermaid.render(uniqueId, mermaidDSL)
      .then(({ svg }) => {
        // Clean up temporary DOM container created by Mermaid
        const tempDiv = document.getElementById(`d${uniqueId}`)
        if (tempDiv) tempDiv.remove()

        if (!isMounted || !containerRef.current) return
        containerRef.current.innerHTML = svg

        // Post-process SVG elements to bind click handlers and add live status styling
        const svgEl = containerRef.current.querySelector('svg')
        if (!svgEl) return

        // Make SVG responsive and scale cleanly to fill the available width
        svgEl.removeAttribute('height')
        svgEl.setAttribute('width', '100%')
        svgEl.style.width = '100%'
        svgEl.style.maxWidth = '100%'
        svgEl.style.height = 'auto'
        svgEl.style.display = 'block'

        // Map messages and attach interactions
        const textElements = Array.from(svgEl.querySelectorAll('text.messageText'))
        const allLines = Array.from(svgEl.querySelectorAll('line'))

        textElements.forEach((textEl, idx) => {
          const content = textEl.textContent || ''
          const stepId = mapTextToStep(content)
          if (!stepId) return

          const stepInfo = steps.find(s => s.id === stepId)
          const isSelected = selectedStepId === stepId

          // Find adjacent line element
          let lineEl: SVGLineElement | null = null
          const lineByClass = svgEl.querySelector(`line.messageLine${idx}`) as SVGLineElement | null
          if (lineByClass) {
            lineEl = lineByClass
          } else {
            // Find closest line by Y coordinate
            const textY = textEl.getBoundingClientRect().top
            let minDiff = Infinity
            allLines.forEach((l) => {
              const diff = Math.abs(l.getBoundingClientRect().top - textY)
              if (diff < minDiff) {
                minDiff = diff
                lineEl = l
              }
            })
          }

          // Group elements for styling & clicking
          const targets = [textEl, lineEl].filter(Boolean) as SVGElement[]

          targets.forEach((el) => {
            el.style.cursor = 'pointer'
            el.classList.add('mermaid-interactive')

            // Apply live status classes
            if (stepInfo?.status === 'running') {
              el.classList.add('mermaid-running')
              if (el.tagName.toLowerCase() === 'line') {
                el.style.stroke = '#38bdf8'
                el.style.strokeWidth = '3px'
                el.style.strokeDasharray = '6 3'
                el.style.animation = 'mermaidFlowDash 0.8s linear infinite'
              } else {
                el.style.fill = '#38bdf8'
                el.style.fontWeight = 'bold'
              }
            } else if (stepInfo?.status === 'done') {
              el.classList.add('mermaid-done')
              if (el.tagName.toLowerCase() === 'line') {
                el.style.stroke = '#10b981'
                el.style.strokeWidth = '2px'
              } else {
                el.style.fill = '#a7f3d0'
              }
            } else if (stepInfo?.status === 'error') {
              el.classList.add('mermaid-error')
              if (el.tagName.toLowerCase() === 'line') {
                el.style.stroke = '#ef4444'
                el.style.strokeWidth = '2px'
              } else {
                el.style.fill = '#fca5a5'
              }
            }

            // Apply selected step highlight
            if (isSelected) {
              if (el.tagName.toLowerCase() === 'line') {
                el.style.stroke = '#38bdf8'
                el.style.strokeWidth = '4px'
                el.style.filter = 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.9))'
              } else {
                el.style.fill = '#38bdf8'
                el.style.fontWeight = 'bold'
                el.style.filter = 'drop-shadow(0 0 4px rgba(56, 189, 248, 0.8))'
              }
            }

            // Click listener
            el.onclick = (e) => {
              e.stopPropagation()
              selectStep(stepId)
            }
          })
        })
      })
      .catch((err) => {
        if (!isMounted) return
        console.error('Mermaid render error:', err)
        setRenderError(err?.message || 'Failed to render sequence diagram')
      })

    return () => {
      isMounted = false
    }
  }, [mermaidDSL, steps, selectedStepId, selectStep, isExpanded])

  const handleCopyCode = () => {
    navigator.clipboard.writeText(mermaidDSL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (steps.length === 0) return null

  return (
    <div className="border border-slate-800 rounded-lg p-4 bg-slate-900/40 flex flex-col w-full">
      {/* Dynamic Keyframe Style */}
      <style>{`
        @keyframes mermaidFlowDash {
          from { stroke-dashoffset: 18; }
          to { stroke-dashoffset: 0; }
        }
        .mermaid-interactive {
          transition: all 0.2s ease-in-out;
        }
        .mermaid-interactive:hover {
          filter: drop-shadow(0 0 6px rgba(56, 189, 248, 0.9));
        }
      `}</style>

      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" />
            <h3 className="text-sm font-semibold text-slate-200">Protocol Sequence Diagram</h3>
          </div>
          {selectedCredType && (
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-sky-400 border border-slate-700">
              {selectedCredType.format}
            </span>
          )}
          {isRunning && (
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/30 animate-pulse">
              Live Exchange
            </span>
          )}
          {tamperMode !== 'none' && (
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Negative: {tamperMode}
            </span>
          )}
        </div>

        {/* Toolbar Actions */}
        <div className="flex items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => setViewMode('full')}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                viewMode === 'full'
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Full Lifecycle
            </button>
            <button
              onClick={() => setViewMode('openid4vp')}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                viewMode === 'openid4vp'
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              OpenID4VP Focus
            </button>
            <button
              onClick={() => setViewMode('code')}
              className={`text-xs px-2.5 py-1 rounded transition-colors ${
                viewMode === 'code'
                  ? 'bg-blue-600 text-white font-medium shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Mermaid Code
            </button>
          </div>

          {/* Expand / Split View Toggle */}
          {onToggleExpand && (
            <button
              onClick={onToggleExpand}
              title={isExpanded ? 'Switch to side-by-side view' : 'Expand diagram across full screen width'}
              className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <svg className="w-3.5 h-3.5 text-sky-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                {isExpanded ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0l5 0m-5 0l0 5M15 9l5-5m0 0l-5 0m5 0l0 5M9 15l-5 5m0 0l5 0m-5 0l0-5M15 15l5 5m0 0l-5 0m5 0l0-5" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                )}
              </svg>
              <span className="font-medium">{isExpanded ? 'Side-by-Side' : 'Full Width'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Diagram and Code View (Both preserved without DOM unmount flickering) */}
      <div className={viewMode === 'code' ? 'block' : 'hidden'}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-slate-400">Mermaid Sequence DSL (Markdown compatible)</span>
          <button
            onClick={handleCopyCode}
            className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors flex items-center gap-1.5"
          >
            {copied ? 'Copied' : 'Copy DSL'}
          </button>
        </div>
        <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-slate-300 overflow-x-auto leading-relaxed max-h-[420px]">
          {mermaidDSL}
        </pre>
      </div>

      <div className={viewMode === 'code' ? 'hidden' : 'block'}>
        {renderError ? (
          <div className="p-6 text-center text-red-400 bg-red-950/20 border border-red-800/40 rounded-lg text-xs font-mono">
            Failed to render Mermaid SVG: {renderError}
          </div>
        ) : (
          <div
            ref={containerRef}
            className={`overflow-x-auto ${isExpanded ? 'min-h-[460px] max-h-[850px]' : 'min-h-[380px] max-h-[750px]'} overflow-y-auto flex justify-center items-start py-2 transition-all duration-300 w-full`}
          />
        )}
      </div>

      {/* Bottom Status & Interactivity Hint */}
      <div className="mt-4 pt-3 border-t border-slate-800 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-400">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Done
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" /> Active
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-red-400" /> Error/Tamper
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-slate-600" /> Pending
          </span>
        </div>

        <div className="text-slate-500">
          Click any arrow or step in the diagram to inspect its payload in Flow Progress
        </div>
      </div>
    </div>
  )
}
