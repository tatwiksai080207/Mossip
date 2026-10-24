import { useState, useEffect, useRef } from 'react'
import mermaid from 'mermaid'
import { useStore } from '../../store/index'
import { useTheme } from '../../context/ThemeContext'
import { initMermaid } from './mermaid-config'
import { mapTextToStep, generateFullFlowDSL, generateVpFocusedDSL, hexToRgb } from './sequence-dsl'

interface SequenceDiagramProps {
  isExpanded?: boolean
  onToggleExpand?: () => void
}


export default function SequenceDiagram({ isExpanded = false, onToggleExpand }: SequenceDiagramProps = {}) {
  const {
    steps,
    isRunning,
    selectedIssuer,
    selectedWallet,
    selectedVerifier,
    selectedCredType,
    runTamperMode: tamperMode,
    selectedStepId,
    selectStep,
    networkEvents,
  } = useStore()
  const { currentTheme } = useTheme()

  const [viewMode, setViewMode] = useState<'full' | 'openid4vp' | 'code'>('full')
  const [copied, setCopied] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const issuerName = selectedIssuer?.name || 'Issuer'
  const walletName = selectedWallet?.name || 'Wallet'
  const verifierName = selectedVerifier?.name || 'Verifier'
  const credFormat = selectedCredType?.format || 'vc+sd-jwt'

  const phaseBgRgb = hexToRgb(currentTheme.tokens.bgCard)

  const mermaidDSL = viewMode === 'openid4vp'
    ? generateVpFocusedDSL({ walletName, verifierName, credFormat, steps, tamperMode, phaseBgRgb })
    : generateFullFlowDSL({
        issuerName,
        walletName,
        verifierName,
        credFormat,
        steps,
        tamperMode,
        networkEvents,
        phaseBgRgb,
      })

  useEffect(() => {
    initMermaid(isExpanded)
  }, [isExpanded, currentTheme.id])

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
        // Round corners and theme the phase background rectangles
        const rectElements = Array.from(svgEl.querySelectorAll('rect'))
        rectElements.forEach((r) => {
          // Do not override participant actor boxes
          if (r.classList.contains('actor') || r.parentElement?.classList.contains('actor')) return
          r.setAttribute('rx', '12')
          r.setAttribute('ry', '12')
          r.style.fill = currentTheme.tokens.bgCard
          r.style.fillOpacity = '0.7'
          r.style.stroke = currentTheme.tokens.borderBase
          r.style.strokeWidth = '1px'
        })

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
  }, [mermaidDSL, steps, selectedStepId, selectStep, isExpanded, currentTheme.id])

  const handleCopyCode = () => {
    navigator.clipboard.writeText(mermaidDSL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (steps.length === 0) return null

  return (
    <div className="border border-app-border rounded-lg p-4 bg-app-card/40 flex flex-col w-full">
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
          filter: drop-shadow(0 0 6px var(--app-accent, rgba(99, 102, 241, 0.9)));
        }
      `}</style>

      {/* Top Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 pb-3 border-b border-app-border">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-app-accent animate-pulse" />
            <h3 className="text-sm font-semibold text-app-text">Protocol Sequence Diagram</h3>
          </div>
          {selectedCredType && (
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-app-base text-app-accent border border-app-border">
              {selectedCredType.format}
            </span>
          )}
          {isRunning && (
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-app-accent-subtle text-app-accent border border-app-accent/30 animate-pulse">
              Live Exchange
            </span>
          )}
          {tamperMode !== 'none' && (
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded bg-app-tamper-bg text-app-tamper border border-app-tamper-border">
              Negative: {tamperMode}
            </span>
          )}
        </div>

        {/* Toolbar Actions */}
        <div className="flex items-center gap-2">
          {/* View Mode Switcher */}
          <div className="flex items-center gap-1 bg-app-base p-1 rounded-lg border border-app-border">
            <button
              onClick={() => setViewMode('full')}
              className={`text-xs px-2.5 py-1 rounded transition-colors cursor-pointer ${
                viewMode === 'full'
                  ? 'bg-app-accent text-white font-medium shadow-sm'
                  : 'text-app-text-muted hover:text-app-text hover:bg-app-card-hover'
              }`}
            >
              Full Lifecycle
            </button>
            <button
              onClick={() => setViewMode('openid4vp')}
              className={`text-xs px-2.5 py-1 rounded transition-colors cursor-pointer ${
                viewMode === 'openid4vp'
                  ? 'bg-app-accent text-white font-medium shadow-sm'
                  : 'text-app-text-muted hover:text-app-text hover:bg-app-card-hover'
              }`}
            >
              OpenID4VP Focus
            </button>
            <button
              onClick={() => setViewMode('code')}
              className={`text-xs px-2.5 py-1 rounded transition-colors cursor-pointer ${
                viewMode === 'code'
                  ? 'bg-app-accent text-white font-medium shadow-sm'
                  : 'text-app-text-muted hover:text-app-text hover:bg-app-card-hover'
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
              className="text-xs px-2.5 py-1.5 rounded-lg bg-app-card hover:bg-app-card-hover border border-app-border text-app-text-secondary hover:text-app-text transition-colors flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 text-app-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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

      {/* Main Diagram and Code View */}
      <div className={viewMode === 'code' ? 'block' : 'hidden'}>
        <div className="flex justify-between items-center mb-2">
          <span className="text-xs text-app-text-muted">Mermaid Sequence DSL (Markdown compatible)</span>
          <button
            onClick={handleCopyCode}
            className="text-xs px-2.5 py-1 rounded bg-app-card hover:bg-app-card-hover border border-app-border text-app-text-secondary hover:text-app-text transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            {copied ? 'Copied' : 'Copy DSL'}
          </button>
        </div>
        <pre className="bg-app-base border border-app-border rounded-lg p-4 text-xs font-mono text-app-text-secondary overflow-x-auto leading-relaxed max-h-[420px]">
          {mermaidDSL}
        </pre>
      </div>

      <div className={viewMode === 'code' ? 'hidden' : 'block'}>
        {renderError ? (
          <div className="p-6 text-center text-rose-400 bg-rose-950/20 border border-rose-800/40 rounded-lg text-xs font-mono">
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
      <div className="mt-4 pt-3 border-t border-app-border flex flex-wrap items-center justify-between gap-3 text-[11px] text-app-text-muted">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500" /> Done
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-app-accent animate-pulse" /> Active
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-rose-400" /> Error/Tamper
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-app-text-muted" /> Pending
          </span>
        </div>

        <div className="text-app-text-muted">
          Click any arrow or step in the diagram to inspect its payload in Flow Progress
        </div>
      </div>
    </div>
  )
}
