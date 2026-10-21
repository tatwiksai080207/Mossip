import { useState, useMemo } from 'react'
import { useStore } from '../store'
import type { TestRun, CredentialFormat } from '../types'

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 sm:p-5 bg-slate-950/40 border-b border-slate-800">
        {Object.entries(releaseStats).map(([ver, stats]) => {
          const rate = Math.round((stats.pass / stats.total) * 100)
          const isSelected = selectedVersion === ver
          return (
            <button
              key={ver}
              onClick={() => setSelectedVersion(selectedVersion === ver ? 'all' : ver)}
              className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer ${
                isSelected
                  ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500/50'
                  : 'border-slate-800 hover:border-slate-700 bg-slate-900/60'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className={`px-2 py-0.5 text-xs font-semibold rounded border ${getVersionBadge(ver)}`}>
                  Release {ver}
                </span>
                <span className={`text-xs font-bold ${rate === 100 ? 'text-emerald-400' : rate >= 60 ? 'text-amber-400' : 'text-red-400'}`}>
                  {rate}% Pass
                </span>
              </div>
              <div className="mt-2.5 flex items-center justify-between text-xs text-slate-400">
                <span>{stats.pass} passed / {stats.total} total</span>
                <span className="text-[11px] text-slate-500">
                  {stats.fail === 0 ? '✓ 0 Regressions' : `✗ ${stats.fail} gap(s)`}
                </span>
              </div>
              {/* Progress bar */}
              <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-500 ${
                    rate === 100 ? 'bg-emerald-500' : rate >= 60 ? 'bg-amber-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${rate}%` }}
                />
              </div>
            </button>
          )
        })}
      </div>

      {/* 3. Interactive Filter Bar */}
      <div className="p-4 border-b border-slate-800 bg-slate-900/20 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Release Filter */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-500 font-medium">Release:</span>
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Releases</option>
              {availableVersions.map(v => (
                <option key={v} value={v} className="bg-slate-900">{v}</option>
              ))}
            </select>
          </div>

          {/* Format Filter */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-500 font-medium">Format:</span>
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Formats</option>
              <option value="ldp_vc" className="bg-slate-900">W3C VC (JSON-LD)</option>
              <option value="vc+sd-jwt" className="bg-slate-900">SD-JWT VC</option>
              <option value="mso_mdoc" className="bg-slate-900">ISO 18013-5 mDoc</option>
            </select>
          </div>

          {/* Outcome Filter */}
          <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5">
            <span className="text-slate-500 font-medium">Outcome:</span>
            <select
              value={selectedOutcome}
              onChange={(e) => setSelectedOutcome(e.target.value)}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">All Outcomes</option>
              <option value="pass" className="bg-slate-900 text-emerald-400">PASS (✓)</option>
              <option value="fail" className="bg-slate-900 text-red-400">FAIL (✗)</option>
            </select>
          </div>

          {/* Search Input */}
          <input
            type="text"
            placeholder="Search runs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-700 w-40 sm:w-52"
          />

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              className="px-2.5 py-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-slate-400">
          <span>Showing <strong>{filteredRuns.length}</strong> of {history.length} runs</span>
          <button
            onClick={exportFilteredJSON}
            disabled={filteredRuns.length === 0}
            className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50"
          >
            Export Filtered JSON
          </button>
        </div>
      </div>

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
                      <span className="font-mono text-slate-400">⏱ {(run.durationMs / 1000).toFixed(1)}s</span>
                    )}
                    <span>{formatRelativeTime(run.timestamp)}</span>
                    <span className="text-slate-600 text-sm">{isExpanded ? '▴' : '▾'}</span>
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
                                <span className={st.status === 'done' ? 'text-emerald-400' : st.status === 'error' ? 'text-red-400' : 'text-slate-500'}>
                                  {st.status === 'done' ? '✓' : st.status === 'error' ? '✗' : '○'}
                                </span>
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
