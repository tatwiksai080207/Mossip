import { useState, useMemo } from 'react'
import { useStore } from '../../store/index'
import type { CredentialFormat } from '../../types'
import { RunHistoryStats } from './RunHistoryStats'
import { RunHistoryFilters } from './RunHistoryFilters'


const FORMAT_LABELS: Record<string, string> = {
  'ldp_vc': 'W3C VC (JSON-LD)',
  'vc+sd-jwt': 'SD-JWT VC',
  'mso_mdoc': 'ISO 18013-5 mDoc',
}

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function getVersionBadge(version?: string) {
  const ver = version || 'v0.17.0'
  if (ver.includes('17')) {
    return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
  }
  if (ver.includes('16')) {
    return 'bg-amber-500/20 text-amber-300 border-amber-500/30'
  }
  return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
}

function getFormatBadge(format: CredentialFormat | string) {
  if (format === 'vc+sd-jwt') return 'bg-purple-500/20 text-purple-300 border-purple-500/30'
  if (format === 'mso_mdoc') return 'bg-blue-500/20 text-blue-300 border-blue-500/30'
  return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
}

export default function RunHistory() {
  const { history, clearHistory, resetToBaseline } = useStore()
  
  // Filter States
  const [selectedVersion, setSelectedVersion] = useState<string>('all')
  const [selectedFormat, setSelectedFormat] = useState<string>('all')
  const [selectedOutcome, setSelectedOutcome] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null)

  // Unique release versions present in history
  const availableVersions = useMemo(() => {
    const set = new Set<string>()
    history.forEach(r => {
      if (r.version) set.add(r.version.replace(' (Live)', ''))
      else set.add('v0.17.0')
    })
    return Array.from(set).sort().reverse()
  }, [history])

  // Regression Tracking per Release Version
  const releaseStats = useMemo(() => {
    const stats: Record<string, { total: number; pass: number; fail: number }> = {}
    history.forEach(r => {
      const verKey = (r.version || 'v0.17.0').replace(' (Live)', '')
      if (!stats[verKey]) stats[verKey] = { total: 0, pass: 0, fail: 0 }
      stats[verKey].total++
      if (r.result === 'pass') stats[verKey].pass++
      else stats[verKey].fail++
    })
    return stats
  }, [history])

  // Filtered runs
  const filteredRuns = useMemo(() => {
    return history.filter(run => {
      const runVer = (run.version || 'v0.17.0').replace(' (Live)', '')
      if (selectedVersion !== 'all' && runVer !== selectedVersion) {
        return false
      }
      if (selectedFormat !== 'all' && run.config.credentialType.format !== selectedFormat) {
        return false
      }
      if (selectedOutcome !== 'all' && run.result !== selectedOutcome) {
        return false
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase()
        const text = `${run.config.issuer.name} ${run.config.wallet.name} ${run.config.verifier.name} ${run.config.credentialType.name} ${run.version || ''}`.toLowerCase()
        if (!text.includes(query)) return false
      }
      return true
    })
  }, [history, selectedVersion, selectedFormat, selectedOutcome, searchQuery])

  const hasActiveFilters = selectedVersion !== 'all' || selectedFormat !== 'all' || selectedOutcome !== 'all' || searchQuery.trim() !== ''

  const handleResetFilters = () => {
    setSelectedVersion('all')
    setSelectedFormat('all')
    setSelectedOutcome('all')
    setSearchQuery('')
  }

  const exportFilteredJSON = () => {
    const blob = new Blob([JSON.stringify(filteredRuns, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inji-historical-runs-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="border border-slate-800 rounded-xl bg-slate-900/40 overflow-hidden shadow-sm">
      {/* 1. Header */}
      <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-slate-100">Historical Regression Dashboard</h3>
            <span className="px-2 py-0.5 text-xs font-mono rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Task #5: Cross-Release Tracking
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Historical test runs and regression tracking across Inji releases (v0.15.0 → v0.16.2 → v0.17.0).
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={resetToBaseline}
            className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors"
            title="Restore multi-release baseline regression test history"
          >
            Reset Baseline Runs
          </button>
          <button
            onClick={clearHistory}
            className="px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 transition-colors"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* 2. Release Regression Summary Cards */}
      <RunHistoryStats
        releaseStats={releaseStats}
        selectedVersion={selectedVersion}
        onSelectVersion={(ver) => setSelectedVersion(selectedVersion === ver ? 'all' : ver)}
        getVersionBadge={getVersionBadge}
      />

      {/* 3. Interactive Filter Bar */}
      <RunHistoryFilters
        selectedVersion={selectedVersion}
        setSelectedVersion={setSelectedVersion}
        availableVersions={availableVersions}
        selectedFormat={selectedFormat}
        setSelectedFormat={setSelectedFormat}
        selectedOutcome={selectedOutcome}
        setSelectedOutcome={setSelectedOutcome}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        hasActiveFilters={hasActiveFilters}
        onResetFilters={handleResetFilters}
        totalCount={history.length}
        filteredCount={filteredRuns.length}
        onExportFilteredJSON={exportFilteredJSON}
      />


      {/* 4. Run List / Table */}
      {filteredRuns.length === 0 ? (
        <div className="p-8 text-center text-slate-500 text-sm">
          No historical runs match the selected filters.
          <div className="mt-2">
            <button
              onClick={handleResetFilters}
              className="text-xs text-blue-400 hover:underline"
            >
              Clear filters
            </button>
          </div>
        </div>
      ) : (
        <div className="divide-y divide-slate-800/60 max-h-[500px] overflow-y-auto">
          {filteredRuns.map((run) => {
            const isExpanded = expandedRunId === run.id
            const format = run.config.credentialType.format
            const ver = run.version || 'v0.17.0'

            return (
              <div key={run.id} className="transition-colors hover:bg-slate-900/30">
                <div
                  onClick={() => setExpandedRunId(isExpanded ? null : run.id)}
                  className="px-4 py-3 flex items-center justify-between text-xs cursor-pointer select-none"
                >
                  <div className="flex items-center gap-3">
                    {/* Outcome Badge */}
                    <span className={`w-14 text-center font-bold px-1.5 py-0.5 rounded text-[11px] ${
                      run.result === 'pass'
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                    }`}>
                      {run.result.toUpperCase()}
                    </span>

                    {/* Version Badge */}
                    <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${getVersionBadge(ver)}`}>
                      {ver}
                    </span>

                    {/* Format Badge */}
                    <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${getFormatBadge(format)}`}>
                      {FORMAT_LABELS[format] || format}
                    </span>

                    {/* Configuration Chain */}
                    <div className="text-slate-300 font-medium truncate max-w-xs sm:max-w-md md:max-w-xl">
                      {run.config.issuer.name} <span className="text-slate-600">→</span> {run.config.wallet.name} <span className="text-slate-600">→</span> {run.config.verifier.name}
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-slate-500 shrink-0">
                    {run.durationMs && (
                      <span className="font-mono text-slate-400 flex items-center gap-1 text-xs">
                        <svg className="w-3.5 h-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <circle cx="12" cy="12" r="9" strokeWidth="2" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 7v5l3 3" />
                        </svg>
                        {(run.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                    <span>{formatRelativeTime(run.timestamp)}</span>
                    <svg className={`w-4 h-4 text-slate-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </div>

                {/* Expanded Diagnostic Details */}
                {isExpanded && (
                  <div className="px-4 pb-4 pt-1 bg-slate-950/60 border-t border-slate-800/80">
                    <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/80 text-xs space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-400 pb-2 border-b border-slate-800">
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Credential Name</span>
                          <span className="text-slate-200 font-medium">{run.config.credentialType.name}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Proof Suite</span>
                          <span className="text-slate-200 font-mono">{run.config.credentialType.proofTypes.join(', ')}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Tamper Mode</span>
                          <span className="text-slate-200">{run.config.tamperMode || 'Normal (none)'}</span>
                        </div>
                        <div>
                          <span className="text-slate-500 block text-[10px] uppercase">Run Timestamp</span>
                          <span className="text-slate-200">{new Date(run.timestamp).toLocaleString()}</span>
                        </div>
                      </div>

                      {/* Step Execution Breakdown */}
                      <div>
                        <span className="text-slate-400 font-semibold block mb-1.5 text-[11px] uppercase tracking-wider">
                          Protocol Step Execution Logs
                        </span>
                        <div className="space-y-1">
                          {run.steps.map((st, idx) => (
                            <div key={idx} className="flex items-center justify-between py-1 px-2 rounded bg-slate-950/40 border border-slate-800/40 text-slate-300">
                              <div className="flex items-center gap-2">
                                {st.status === 'done' ? (
                                  <svg className="w-3.5 h-3.5 text-emerald-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                  </svg>
                                ) : st.status === 'error' ? (
                                  <svg className="w-3.5 h-3.5 text-red-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                ) : (
                                  <div className="w-2.5 h-2.5 rounded-full border border-slate-600 shrink-0 mx-0.5" />
                                )}
                                <span>{idx + 1}. {st.label}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {st.source && (
                                  <span className={`text-[10px] px-1 rounded ${st.source === 'live' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                                    {st.source}
                                  </span>
                                )}
                                <span className={`text-[11px] uppercase font-mono ${st.status === 'done' ? 'text-emerald-400' : st.status === 'error' ? 'text-red-400' : 'text-slate-500'}`}>
                                  {st.status}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Error details if failed */}
                      {run.result === 'fail' && (
                        <div className="p-2.5 rounded bg-red-950/30 border border-red-500/20 text-red-300">
                          <strong className="block text-red-200 mb-0.5">Failure Diagnostic:</strong>
                          <span className="font-mono text-[11px]">
                            {run.steps.find(s => s.status === 'error')?.payload
                              ? JSON.stringify(run.steps.find(s => s.status === 'error')?.payload)
                              : 'Step execution rejected by relying party.'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
