import { useState, useMemo } from 'react'
import { useStore } from '../../store/index'
import type { CredentialFormat, TestRun } from '../../types'
import { RunHistoryStats } from './RunHistoryStats'
import { RunHistoryFilters } from './RunHistoryFilters'
import { RunInspector } from './RunInspector'

const FORMAT_LABELS: Record<string, string> = {
  ldp_vc: 'W3C VC (JSON-LD)',
  'vc+sd-jwt': 'SD-JWT VC',
  mso_mdoc: 'ISO 18013-5 mDoc',
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
    return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
  }
  if (ver.includes('16')) {
    return 'bg-sky-500/15 text-sky-300 border-sky-500/30'
  }
  return 'bg-purple-500/15 text-purple-300 border-purple-500/30'
}

function getFormatBadge(format: CredentialFormat | string) {
  if (format === 'vc+sd-jwt') return 'bg-purple-500/15 text-purple-300 border-purple-500/30'
  if (format === 'mso_mdoc') return 'bg-sky-500/15 text-sky-300 border-sky-500/30'
  return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
}

export default function RunHistory() {
  const { history, clearHistory, resetToBaseline } = useStore()

  // Filter States
  const [selectedVersion, setSelectedVersion] = useState<string>('all')
  const [selectedFormat, setSelectedFormat] = useState<string>('all')
  const [selectedOutcome, setSelectedOutcome] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)

  // Unique release versions present in history
  const availableVersions = useMemo(() => {
    const set = new Set<string>()
    history.forEach((r) => {
      if (r.version) set.add(r.version.replace(' (Live)', ''))
      else set.add('v0.17.0')
    })
    return Array.from(set).sort().reverse()
  }, [history])

  // Regression Tracking per Release Version
  const releaseStats = useMemo(() => {
    const stats: Record<string, { total: number; pass: number; fail: number }> = {}
    history.forEach((r) => {
      const verKey = (r.version || 'v0.17.0').replace(' (Live)', '')
      if (!stats[verKey]) stats[verKey] = { total: 0, pass: 0, fail: 0 }
      stats[verKey].total++
      if (r.result === 'pass') stats[verKey].pass++
      else stats[verKey].fail++
    })
    return stats
  }, [history])

  // Top level aggregates for the full-width KPI strip
  const totalRuns = history.length
  const totalPassed = history.filter((r) => r.result === 'pass').length
  const overallPassRate = totalRuns > 0 ? Math.round((totalPassed / totalRuns) * 100) : 0
  const totalGaps = history.filter((r) => r.result === 'fail').length

  const avgLatencySec = useMemo(() => {
    const runsWithDuration = history.filter((r) => typeof r.durationMs === 'number' && r.durationMs > 0)
    if (runsWithDuration.length === 0) return '—'
    const totalMs = runsWithDuration.reduce((acc, r) => acc + (r.durationMs || 0), 0)
    return `${(totalMs / runsWithDuration.length / 1000).toFixed(1)}s`
  }, [history])

  // Filtered runs
  const filteredRuns = useMemo(() => {
    return history.filter((run) => {
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

  const hasActiveFilters =
    selectedVersion !== 'all' ||
    selectedFormat !== 'all' ||
    selectedOutcome !== 'all' ||
    searchQuery.trim() !== ''

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

  const selectedRun: TestRun | undefined = useMemo(() => {
    return history.find((r) => r.id === selectedRunId)
  }, [history, selectedRunId])

  return (
    <div className="w-full flex-1 flex flex-col min-h-[640px] border border-app-border rounded-2xl bg-app-card/40 backdrop-blur-md overflow-hidden shadow-sm">
      {/* 1. Header Bar */}
      <div className="p-4 sm:p-5 border-b border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h3 className="text-base font-semibold text-app-text tracking-tight">Historical Regression Dashboard</h3>
          <p className="text-xs text-app-text-muted mt-0.5">
            Cross-release benchmarks and verifiable credential protocol telemetry
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <button
            onClick={resetToBaseline}
            className="px-3 py-1.5 rounded-lg bg-app-card hover:bg-app-card-hover text-app-text-secondary hover:text-app-text border border-app-border transition-colors cursor-pointer"
            title="Restore multi-release baseline regression test history"
          >
            Reset Baseline Runs
          </button>
          <button
            onClick={clearHistory}
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 transition-colors cursor-pointer"
          >
            Clear All
          </button>
        </div>
      </div>

      {/* 2. Top Metric KPI Strip & Quick Release Filter */}
      <RunHistoryStats
        totalRuns={totalRuns}
        overallPassRate={overallPassRate}
        avgLatencySec={avgLatencySec}
        totalGaps={totalGaps}
        releaseStats={releaseStats}
        selectedVersion={selectedVersion}
        onSelectVersion={(ver) => setSelectedVersion(selectedVersion === ver ? 'all' : ver)}
      />

      {/* 3. Filter & Search Toolbar */}
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

      {/* 4. Master-Detail Responsive Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden relative">
        {/* Left Master Data Table */}
        <div
          className={`h-full flex flex-col overflow-hidden transition-all duration-300 ${
            selectedRun ? 'w-full lg:w-[60%] xl:w-[63%]' : 'w-full'
          }`}
        >
          {filteredRuns.length === 0 ? (
            <div className="p-12 text-center text-app-text-muted text-sm flex-1 flex flex-col items-center justify-center">
              <p>No historical runs match the selected filters.</p>
              <button onClick={handleResetFilters} className="mt-2 text-xs text-app-accent hover:underline cursor-pointer">
                Clear all filters
              </button>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-app-base/80 border-b border-app-border text-[11px] font-semibold text-app-text-muted uppercase tracking-wider sticky top-0 z-10 backdrop-blur-md">
                  <tr>
                    <th className="py-2.5 px-4 w-20">Status</th>
                    <th className="py-2.5 px-3 w-28">Timestamp</th>
                    <th className="py-2.5 px-3 w-24">Release</th>
                    <th className="py-2.5 px-3">Route (Issuer → Wallet → Verifier)</th>
                    <th className="py-2.5 px-3 w-36">Format</th>
                    <th className="py-2.5 px-3 w-20 text-right">Latency</th>
                    <th className="py-2.5 px-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-app-border/60 font-sans">
                  {filteredRuns.map((run) => {
                    const isSelected = selectedRunId === run.id
                    const format = run.config.credentialType.format
                    const ver = run.version || 'v0.17.0'

                    return (
                      <tr
                        key={run.id}
                        onClick={() => setSelectedRunId(isSelected ? null : run.id)}
                        className={`transition-colors cursor-pointer select-none group ${
                          isSelected
                            ? 'bg-app-accent-subtle border-l-2 border-l-app-accent'
                            : 'hover:bg-app-card-hover/50'
                        }`}
                      >
                        {/* Status */}
                        <td className="py-3 px-4">
                          <span
                            className={`font-bold px-2 py-0.5 rounded text-[10px] tracking-wider border inline-block text-center w-14 ${
                              run.result === 'pass'
                                ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                : 'bg-rose-500/15 text-rose-400 border-rose-500/30'
                            }`}
                          >
                            {run.result.toUpperCase()}
                          </span>
                        </td>

                        {/* Timestamp */}
                        <td className="py-3 px-3 text-app-text-muted whitespace-nowrap">
                          {formatRelativeTime(run.timestamp)}
                        </td>

                        {/* Release */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`px-1.5 py-0.5 text-[10px] font-mono rounded border ${getVersionBadge(ver)}`}>
                            {ver}
                          </span>
                        </td>

                        {/* Route */}
                        <td className="py-3 px-3 text-app-text font-medium">
                          <div className="flex items-center gap-1.5 truncate max-w-xs sm:max-w-sm md:max-w-md lg:max-w-lg">
                            <span className="text-app-text truncate">{run.config.issuer.name}</span>
                            <span className="text-app-text-muted text-[10px]">→</span>
                            <span className="text-app-text truncate">{run.config.wallet.name}</span>
                            <span className="text-app-text-muted text-[10px]">→</span>
                            <span className="text-app-text truncate">{run.config.verifier.name}</span>
                          </div>
                        </td>

                        {/* Format */}
                        <td className="py-3 px-3 whitespace-nowrap">
                          <span className={`px-2 py-0.5 text-[10px] font-semibold rounded border ${getFormatBadge(format)}`}>
                            {FORMAT_LABELS[format] || format}
                          </span>
                        </td>

                        {/* Duration */}
                        <td className="py-3 px-3 text-right font-mono text-app-text-muted whitespace-nowrap">
                          {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                        </td>

                        {/* Inspector indicator arrow */}
                        <td className="py-3 px-3 text-center text-app-text-muted group-hover:text-app-text">
                          <svg className={`w-4 h-4 transition-transform ${isSelected ? 'text-app-accent rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Right Detail Inspector Panel */}
        {selectedRun && (
          <div className="w-full lg:w-[40%] xl:w-[37%] h-full shrink-0 shadow-2xl z-20">
            <RunInspector run={selectedRun} onClose={() => setSelectedRunId(null)} />
          </div>
        )}
      </div>
    </div>
  )
}
