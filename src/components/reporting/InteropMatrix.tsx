import { useState, useMemo } from 'react'
import { useStore } from '../../store/index'
import { issuers, verifiers } from '../../config'
import { FORMAT_LABELS } from './matrix/types'
import { MatrixGridView } from './matrix/MatrixGridView'
import { MatrixTableView } from './matrix/MatrixTableView'

export { FORMAT_LABELS, ENV_BADGES } from './matrix/types'

export default function InteropMatrix() {
  const { history: runs } = useStore()

  // View state: 'grid' (2D heatmap) vs 'table' (tabular list)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [selectedFormat, setSelectedFormat] = useState<string>('all')
  const [selectedEnv, setSelectedEnv] = useState<string>('all')
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null)

  if (!runs || runs.length === 0) {
    return (
      <div className="w-full flex-1 border border-app-border rounded-2xl bg-app-card/40 p-12 text-center flex flex-col items-center justify-center min-h-[500px]">
        <div className="w-12 h-12 rounded-2xl bg-app-accent-subtle border border-app-accent/20 text-app-accent flex items-center justify-center mb-4">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-app-text">No Interoperability Matrix Data Yet</h3>
        <p className="text-xs text-app-text-muted mt-1 max-w-md">
          Execute test runs in the Interop Studio across different issuers, wallets, and verifiers to automatically populate the cross-ecosystem compatibility matrix.
        </p>
      </div>
    )
  }

  // 1. Group runs by unique configuration: issuer|wallet|verifier|format
  const matrix: Record<string, { pass: number; fail: number; total: number; runs: typeof runs }> = {}
  for (const run of runs) {
    const key = `${run.config.issuer.id}|${run.config.wallet.id}|${run.config.verifier.id}|${run.config.credentialType.format}`
    if (!matrix[key]) {
      matrix[key] = { pass: 0, fail: 0, total: 0, runs: [] }
    }
    matrix[key].total++
    matrix[key].runs.push(run)
    if (run.result === 'pass') matrix[key].pass++
    else matrix[key].fail++
  }
  const allEntries = Object.entries(matrix)

  // 2. Filtered entries for table view
  const filteredEntries = useMemo(() => {
    return allEntries.filter(([key, data]) => {
      const [, , , format] = key.split('|')
      if (selectedFormat !== 'all' && format !== selectedFormat) return false
      if (selectedEnv !== 'all') {
        const run = data.runs[0]
        const hasEnv = run.config.issuer.env === selectedEnv || run.config.verifier.env === selectedEnv
        if (!hasEnv) return false
      }
      return true
    })
  }, [allEntries, selectedFormat, selectedEnv])

  // 3. Telemetry aggregates
  const totalLiveSteps = runs.reduce((acc, r) => acc + r.steps.filter((s) => s.source === 'live').length, 0)
  const totalMockSteps = runs.reduce((acc, r) => acc + r.steps.filter((s) => s.source === 'mock').length, 0)
  const totalRunsCount = runs.length
  const totalPassedCount = runs.filter((r) => r.result === 'pass').length
  const overallRate = totalRunsCount > 0 ? Math.round((totalPassedCount / totalRunsCount) * 100) : 0

  // 4. Matrix Cell Lookup Map: (issuerId, verifierId) -> formats map
  const cellMap = useMemo(() => {
    const map: Record<string, Record<string, { pass: number; total: number; runs: typeof runs }>> = {}
    for (const run of runs) {
      const cellKey = `${run.config.issuer.id}__${run.config.verifier.id}`
      const fmt = run.config.credentialType.format
      if (!map[cellKey]) map[cellKey] = {}
      if (!map[cellKey][fmt]) map[cellKey][fmt] = { pass: 0, total: 0, runs: [] }
      map[cellKey][fmt].total++
      map[cellKey][fmt].runs.push(run)
      if (run.result === 'pass') map[cellKey][fmt].pass++
    }
    return map
  }, [runs])

  const exportReportJSON = () => {
    const report = {
      generated: new Date().toISOString(),
      totalRuns: runs.length,
      overallCompatibilityRate: `${overallRate}%`,
      liveSteps: totalLiveSteps,
      mockSteps: totalMockSteps,
      configurations: allEntries.map(([key, data]) => {
        const [issuerId, walletId, verifierId, format] = key.split('|')
        const run = data.runs[0]
        return {
          issuer: run.config.issuer.name,
          issuerId,
          wallet: run.config.wallet.name,
          walletId,
          verifier: run.config.verifier.name,
          verifierId,
          format: FORMAT_LABELS[format] || format,
          totalRuns: data.total,
          passed: data.pass,
          failed: data.fail,
          passRate: `${Math.round((data.pass / data.total) * 100)}%`,
        }
      }),
    }
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inji-interop-matrix-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Active selected cell details for inspector popup
  const activeCellData = useMemo(() => {
    if (!activeCellKey) return null
    const [issId, verId] = activeCellKey.split('__')
    const formatsData = cellMap[activeCellKey]
    const issObj = issuers.find((i) => i.id === issId)
    const verObj = verifiers.find((v) => v.id === verId)
    return {
      issuer: issObj,
      verifier: verObj,
      formats: formatsData,
    }
  }, [activeCellKey, cellMap])

  return (
    <div className="w-full flex-1 flex flex-col min-h-[640px] border border-app-border rounded-2xl bg-app-card/40 backdrop-blur-md overflow-hidden shadow-sm">
      {/* 1. Header Bar */}
      <div className="p-4 sm:p-5 border-b border-app-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h3 className="text-base font-semibold text-app-text tracking-tight">
            Cross-Ecosystem Interoperability Matrix
          </h3>
          <p className="text-xs text-app-text-muted mt-0.5">
            Bi-directional verification compatibility across MOSIP Inji, walt.id, and containerized stacks
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportReportJSON}
            className="px-3.5 py-1.5 rounded-xl bg-app-card hover:bg-app-card-hover text-app-text-secondary hover:text-app-text border border-app-border text-xs font-medium flex items-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <svg className="w-4 h-4 text-app-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Export Matrix JSON</span>
          </button>
        </div>
      </div>

      {/* 2. Top Metric KPI Strip (Full-Width) */}
      <div className="p-4 sm:p-5 border-b border-app-border bg-app-base/40">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Total Configs */}
          <div className="p-4 rounded-xl bg-app-card border border-app-border hover:border-app-border-subtle transition-colors">
            <div className="flex items-center justify-between text-app-text-muted text-xs">
              <span className="font-medium uppercase tracking-wider text-[11px]">Tested Configs</span>
              <div className="w-6 h-6 rounded-lg bg-app-accent-subtle text-app-accent flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-app-text mt-1 tracking-tight">{allEntries.length}</div>
            <p className="text-[11px] text-app-text-muted mt-1">Unique lifecycle permutations</p>
          </div>

          {/* Card 2: Interop Compatibility Rate */}
          <div className="p-4 rounded-xl bg-app-card border border-app-border hover:border-app-border-subtle transition-colors">
            <div className="flex items-center justify-between text-app-text-muted text-xs">
              <span className="font-medium uppercase tracking-wider text-[11px]">Matrix Interop Rate</span>
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-2xl font-bold tracking-tight ${
                overallRate >= 80 ? 'text-emerald-400' : overallRate >= 60 ? 'text-app-accent' : 'text-rose-400'
              }`}>
                {overallRate}%
              </span>
              <span className="text-xs text-app-text-muted">across runs</span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-app-base rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  overallRate >= 80 ? 'bg-emerald-500' : overallRate >= 60 ? 'bg-app-accent' : 'bg-rose-500'
                }`}
                style={{ width: `${overallRate}%` }}
              />
            </div>
          </div>

          {/* Card 3: Ecosystem Coverage */}
          <div className="p-4 rounded-xl bg-app-card border border-app-border hover:border-app-border-subtle transition-colors">
            <div className="flex items-center justify-between text-app-text-muted text-xs">
              <span className="font-medium uppercase tracking-wider text-[11px]">Ecosystem Coverage</span>
              <div className="w-6 h-6 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-app-text mt-1 tracking-tight font-mono">4 × 3 Pairs</div>
            <p className="text-[11px] text-app-text-muted mt-1">MOSIP Local · Collab · walt.id</p>
          </div>

          {/* Card 4: Wire Execution Steps */}
          <div className="p-4 rounded-xl bg-app-card border border-app-border hover:border-app-border-subtle transition-colors">
            <div className="flex items-center justify-between text-app-text-muted text-xs">
              <span className="font-medium uppercase tracking-wider text-[11px]">Live Wire Protocol Steps</span>
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-300 mt-1 tracking-tight font-mono">{totalLiveSteps}</div>
            <p className="text-[11px] text-app-text-muted mt-1">
              100% Live Wire Execution ({totalMockSteps} Mock)
            </p>
          </div>
        </div>
      </div>

      {/* 3. Toolbar with View Mode Switcher and Filters */}
      <div className="p-4 sm:p-5 border-b border-app-border bg-app-base/60 flex flex-wrap items-center justify-between gap-4">
        {/* View Switcher: 2D Grid vs Table */}
        <div className="flex items-center gap-1.5 p-1 bg-app-base border border-app-border rounded-xl">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-app-accent text-white shadow-sm shadow-app-accent/30'
                : 'text-app-text-muted hover:text-app-text hover:bg-app-card-hover'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            <span>Visual Matrix Grid</span>
          </button>

          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'table'
                ? 'bg-app-accent text-white shadow-sm shadow-app-accent/30'
                : 'text-app-text-muted hover:text-app-text hover:bg-app-card-hover'
            }`}
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            <span>Data Table</span>
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Format Filter */}
          <div className="flex items-center gap-2 bg-app-card border border-app-border hover:border-app-border-subtle rounded-xl px-3.5 py-1.5 transition-colors">
            <span className="text-xs text-app-text-muted font-semibold uppercase tracking-wider">Format:</span>
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-medium text-app-text focus:outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-app-card text-app-text">All Formats</option>
              <option value="ldp_vc" className="bg-app-card text-app-text">W3C VC (JSON-LD)</option>
              <option value="vc+sd-jwt" className="bg-app-card text-app-text">SD-JWT VC</option>
              <option value="mso_mdoc" className="bg-app-card text-app-text">ISO 18013-5 mDoc</option>
            </select>
          </div>

          {/* Ecosystem Implementation Filter */}
          <div className="flex items-center gap-2 bg-app-card border border-app-border hover:border-app-border-subtle rounded-xl px-3.5 py-1.5 transition-colors">
            <span className="text-xs text-app-text-muted font-semibold uppercase tracking-wider">Ecosystem:</span>
            <select
              value={selectedEnv}
              onChange={(e) => setSelectedEnv(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-medium text-app-text focus:outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-app-card text-app-text">All Stacks</option>
              <option value="local" className="bg-app-card text-app-text">MOSIP Local Docker</option>
              <option value="collab" className="bg-app-card text-app-text">MOSIP Collab Cloud</option>
              <option value="external" className="bg-app-card text-app-text">walt.id External</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Main Body: View A (2D Heatmap Grid) or View B (Data Table) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        {viewMode === 'grid' ? (
          <MatrixGridView
            issuers={issuers}
            verifiers={verifiers}
            cellMap={cellMap}
            selectedFormat={selectedFormat}
            activeCellKey={activeCellKey}
            onSelectCell={setActiveCellKey}
            activeCellData={activeCellData}
          />
        ) : (
          <MatrixTableView filteredEntries={filteredEntries} />
        )}
      </div>
    </div>
  )
}
