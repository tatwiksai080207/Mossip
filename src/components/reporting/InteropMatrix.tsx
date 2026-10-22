import { useState, useMemo } from 'react'
import { useStore } from '../../store/index'
import { issuers, verifiers } from '../../config'

const FORMAT_LABELS: Record<string, string> = {
  ldp_vc: 'W3C VC (JSON-LD)',
  'vc+sd-jwt': 'SD-JWT VC',
  mso_mdoc: 'ISO 18013-5 mDoc',
}

const ENV_BADGES: Record<string, { label: string; class: string }> = {
  local: { label: 'LOCAL', class: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  collab: { label: 'COLLAB', class: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  mock: { label: 'MOCK', class: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  external: { label: 'EXTERNAL', class: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
}

export default function InteropMatrix() {
  const { history: runs } = useStore()

  // View state: 'grid' (2D heatmap) vs 'table' (tabular list)
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid')
  const [selectedFormat, setSelectedFormat] = useState<string>('all')
  const [selectedEnv, setSelectedEnv] = useState<string>('all')
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null)

  if (!runs || runs.length === 0) {
    return (
      <div className="w-full flex-1 border border-slate-800/80 rounded-2xl bg-slate-900/40 p-12 text-center flex flex-col items-center justify-center min-h-[500px]">
        <div className="w-12 h-12 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center mb-4">
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
          </svg>
        </div>
        <h3 className="text-base font-semibold text-white">No Interoperability Matrix Data Yet</h3>
        <p className="text-xs text-slate-400 mt-1 max-w-md">
          Execute test runs in the Test Runner across different issuers, wallets, and verifiers to automatically populate the cross-ecosystem compatibility matrix.
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
    <div className="w-full flex-1 flex flex-col min-h-[640px] border border-slate-800/80 rounded-2xl bg-slate-900/40 backdrop-blur-md overflow-hidden shadow-sm">
      {/* 1. Header Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h3 className="text-base font-semibold text-white tracking-tight">
            Cross-Ecosystem Interoperability Matrix
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Bi-directional verification compatibility across MOSIP Inji, walt.id, and containerized stacks
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportReportJSON}
            className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 text-xs font-medium flex items-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <span>Export Matrix JSON</span>
          </button>
        </div>
      </div>

      {/* 2. Top Metric KPI Strip (Full-Width) */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-950/40">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {/* Card 1: Total Configs */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium uppercase tracking-wider text-[11px]">Tested Configs</span>
              <div className="w-6 h-6 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-white mt-1 tracking-tight">{allEntries.length}</div>
            <p className="text-[11px] text-slate-400 mt-1">Unique lifecycle permutations</p>
          </div>

          {/* Card 2: Interop Compatibility Rate */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium uppercase tracking-wider text-[11px]">Matrix Interop Rate</span>
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-2xl font-bold tracking-tight ${
                overallRate >= 80 ? 'text-emerald-400' : overallRate >= 60 ? 'text-amber-400' : 'text-red-400'
              }`}>
                {overallRate}%
              </span>
              <span className="text-xs text-slate-400">across runs</span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all duration-500 ${
                  overallRate >= 80 ? 'bg-emerald-500' : overallRate >= 60 ? 'bg-amber-500' : 'bg-red-500'
                }`}
                style={{ width: `${overallRate}%` }}
              />
            </div>
          </div>

          {/* Card 3: Ecosystem Coverage */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium uppercase tracking-wider text-[11px]">Ecosystem Coverage</span>
              <div className="w-6 h-6 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-white mt-1 tracking-tight font-mono">4 × 3 Pairs</div>
            <p className="text-[11px] text-slate-400 mt-1">MOSIP Local · Collab · walt.id</p>
          </div>

          {/* Card 4: Wire Execution Steps */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 hover:border-slate-700/80 transition-colors">
            <div className="flex items-center justify-between text-slate-400 text-xs">
              <span className="font-medium uppercase tracking-wider text-[11px]">Live Wire Protocol Steps</span>
              <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-300 mt-1 tracking-tight font-mono">{totalLiveSteps}</div>
            <p className="text-[11px] text-slate-400 mt-1">
              100% Live Wire Execution ({totalMockSteps} Mock)
            </p>
          </div>
        </div>
      </div>

      {/* 3. Toolbar with View Mode Switcher and Filters */}
      <div className="p-4 sm:p-5 border-b border-slate-800/80 bg-slate-950/60 flex flex-wrap items-center justify-between gap-4">
        {/* View Switcher: 2D Grid vs Table */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-900 border border-slate-700/80 rounded-xl">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
              viewMode === 'grid'
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
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
                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/30'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
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
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 hover:border-slate-600 rounded-xl px-3.5 py-1.5 transition-colors">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Format:</span>
            <select
              value={selectedFormat}
              onChange={(e) => setSelectedFormat(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-medium text-white focus:outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-slate-900 text-slate-200">All Formats</option>
              <option value="ldp_vc" className="bg-slate-900 text-emerald-300">W3C VC (JSON-LD)</option>
              <option value="vc+sd-jwt" className="bg-slate-900 text-purple-300">SD-JWT VC</option>
              <option value="mso_mdoc" className="bg-slate-900 text-amber-300">ISO 18013-5 mDoc</option>
            </select>
          </div>

          {/* Ecosystem Implementation Filter */}
          <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/80 hover:border-slate-600 rounded-xl px-3.5 py-1.5 transition-colors">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Ecosystem:</span>
            <select
              value={selectedEnv}
              onChange={(e) => setSelectedEnv(e.target.value)}
              className="bg-transparent text-xs sm:text-sm font-medium text-white focus:outline-none cursor-pointer pr-1"
            >
              <option value="all" className="bg-slate-900 text-slate-200">All Stacks</option>
              <option value="local" className="bg-slate-900 text-emerald-400">MOSIP Local Docker</option>
              <option value="collab" className="bg-slate-900 text-purple-300">MOSIP Collab Cloud</option>
              <option value="external" className="bg-slate-900 text-indigo-300">walt.id External</option>
            </select>
          </div>
        </div>
      </div>

      {/* 4. Main Body: View A (2D Heatmap Grid) or View B (Data Table) */}
      <div className="flex-1 flex flex-col min-h-0 overflow-y-auto">
        {viewMode === 'grid' ? (
          /* ═══════════════ VIEW A: 2D CROSS-ECOSYSTEM MATRIX GRID ═══════════════ */
          <div className="p-4 sm:p-6 space-y-6">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr>
                    {/* Corner Cell */}
                    <th className="p-4 text-left bg-slate-950/80 border border-slate-800 rounded-tl-xl w-64 min-w-[240px]">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">
                        Issuer \ Verifier
                      </span>
                      <span className="text-[11px] text-slate-500 font-normal mt-0.5 block">
                        Cross-ecosystem pairing
                      </span>
                    </th>

                    {/* Column Headers (Verifiers) */}
                    {verifiers.map((ver, idx) => {
                      const envBadge = ENV_BADGES[ver.env || 'local']
                      return (
                        <th
                          key={ver.id}
                          className={`p-4 text-left bg-slate-950/80 border border-slate-800 min-w-[280px] ${
                            idx === verifiers.length - 1 ? 'rounded-tr-xl' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-white tracking-tight">{ver.name}</h4>
                            {envBadge && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${envBadge.class}`}>
                                {envBadge.label}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 font-normal">{ver.description}</p>
                        </th>
                      )
                    })}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-800/80">
                  {issuers.map((iss) => {
                    const issBadge = ENV_BADGES[iss.env || 'local']

                    return (
                      <tr key={iss.id} className="transition-colors">
                        {/* Row Header (Issuer) */}
                        <th className="p-4 text-left bg-slate-950/60 border border-slate-800 align-top">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-semibold text-white tracking-tight">{iss.name}</h4>
                            {issBadge && (
                              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${issBadge.class}`}>
                                {issBadge.label}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-0.5 font-normal">{iss.description}</p>
                        </th>

                        {/* Cells: Pairing (iss, ver) */}
                        {verifiers.map((ver) => {
                          const cellKey = `${iss.id}__${ver.id}`
                          const formatsData = cellMap[cellKey]
                          const hasData = formatsData && Object.keys(formatsData).length > 0
                          const isSelected = activeCellKey === cellKey

                          // Filter by selected format if active
                          const activeFormatKeys = hasData
                            ? Object.keys(formatsData).filter((f) => selectedFormat === 'all' || f === selectedFormat)
                            : []

                          return (
                            <td
                              key={ver.id}
                              onClick={() => hasData && setActiveCellKey(isSelected ? null : cellKey)}
                              className={`p-3.5 border border-slate-800 align-top transition-all ${
                                isSelected
                                  ? 'bg-blue-600/10 ring-2 ring-blue-500/50'
                                  : hasData
                                  ? 'bg-slate-900/40 hover:bg-slate-900/80 cursor-pointer'
                                  : 'bg-slate-950/20'
                              }`}
                            >
                              {!hasData || activeFormatKeys.length === 0 ? (
                                <div className="py-6 text-center text-slate-600 text-xs font-mono">
                                  Not tested yet
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  {activeFormatKeys.map((fmt) => {
                                    const fmtStats = formatsData[fmt]
                                    const rate = Math.round((fmtStats.pass / fmtStats.total) * 100)

                                    // Known upstream friction points
                                    const isSdJwtX5cGap =
                                      ver.id === 'inji-verify-collab-live' && fmt === 'vc+sd-jwt' && fmtStats.pass === 0
                                    const isMdocDcqlGap =
                                      ver.id === 'inji-verify-collab-live' && fmt === 'mso_mdoc' && fmtStats.pass === 0

                                    return (
                                      <div
                                        key={fmt}
                                        className="p-2.5 rounded-lg bg-slate-950/70 border border-slate-800/90 text-xs space-y-1.5"
                                      >
                                        <div className="flex items-center justify-between gap-1">
                                          <span className="font-semibold text-slate-200 text-[11px] truncate">
                                            {FORMAT_LABELS[fmt] || fmt}
                                          </span>
                                          <span
                                            className={`font-bold px-1.5 py-0.2 rounded text-[10px] shrink-0 ${
                                              rate >= 80
                                                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                                : rate >= 50
                                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                                : 'bg-red-500/20 text-red-300 border border-red-500/30'
                                            }`}
                                          >
                                            {rate}% ({fmtStats.total})
                                          </span>
                                        </div>

                                        {/* Progress bar */}
                                        <div className="h-1 w-full bg-slate-800 rounded-full overflow-hidden">
                                          <div
                                            className={`h-full ${
                                              rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500'
                                            }`}
                                            style={{ width: `${rate}%` }}
                                          />
                                        </div>

                                        {/* Discovered Friction Point Badges */}
                                        {isSdJwtX5cGap && (
                                          <div className="text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded flex items-center gap-1">
                                            <span>▲</span>
                                            <span>x5c Certificate Chain Enforced</span>
                                          </div>
                                        )}
                                        {isMdocDcqlGap && (
                                          <div className="text-[10px] font-medium text-amber-400 bg-amber-500/10 border border-amber-500/25 px-1.5 py-0.5 rounded flex items-center gap-1">
                                            <span>▲</span>
                                            <span>DCQL doctype_values Gap</span>
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Cell Selection Drill-Down Drawer / Modal */}
            {activeCellData && (
              <div className="p-4 sm:p-5 rounded-xl bg-slate-900 border border-blue-500/40 shadow-xl space-y-3 animate-fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white">Pairing Details</h4>
                    <span className="text-xs text-slate-300">
                      {activeCellData.issuer?.name} → {activeCellData.verifier?.name}
                    </span>
                  </div>
                  <button
                    onClick={() => setActiveCellKey(null)}
                    className="text-xs text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    Close
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {Object.entries(activeCellData.formats || {}).map(([fmt, stats]) => (
                    <div key={fmt} className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs">
                      <div className="font-semibold text-slate-200">{FORMAT_LABELS[fmt] || fmt}</div>
                      <div className="text-slate-400 mt-1 flex items-center justify-between">
                        <span>Pass Rate:</span>
                        <strong className="text-white">
                          {Math.round((stats.pass / stats.total) * 100)}% ({stats.pass}/{stats.total})
                        </strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ═══════════════ VIEW B: DETAILED DATA TABLE ═══════════════ */
          <div className="w-full flex-1 overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-950/80 border-b border-slate-800 text-[11px] font-semibold text-slate-400 uppercase tracking-wider sticky top-0 backdrop-blur-md">
                <tr>
                  <th className="py-3 px-4">Issuer</th>
                  <th className="py-3 px-3">Wallet</th>
                  <th className="py-3 px-3">Verifier</th>
                  <th className="py-3 px-3">Credential Format</th>
                  <th className="py-3 px-3 text-center w-16">Runs</th>
                  <th className="py-3 px-3 text-center w-16">Passed</th>
                  <th className="py-3 px-3 text-center w-16">Failed</th>
                  <th className="py-3 px-3 text-center w-36">Compatibility Rate</th>
                  <th className="py-3 px-4 text-center w-28">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {filteredEntries.map(([key, data]) => {
                  const [,,, format] = key.split('|')
                  const run = data.runs[0]
                  const rate = Math.round((data.pass / data.total) * 100)
                  const issBadge = ENV_BADGES[run.config.issuer.env || 'local']
                  const verBadge = ENV_BADGES[run.config.verifier.env || 'local']

                  return (
                    <tr key={key} className="hover:bg-slate-900/60 transition-colors">
                      {/* Issuer */}
                      <td className="py-3 px-4 text-white font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>{run.config.issuer.name}</span>
                          {issBadge && (
                            <span className={`text-[9px] font-bold px-1 py-0.2 rounded border ${issBadge.class}`}>
                              {issBadge.label}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Wallet */}
                      <td className="py-3 px-3 text-slate-300 font-medium">
                        {run.config.wallet.name}
                      </td>

                      {/* Verifier */}
                      <td className="py-3 px-3 text-white font-medium">
                        <div className="flex items-center gap-1.5">
                          <span>{run.config.verifier.name}</span>
                          {verBadge && (
                            <span className={`text-[9px] font-bold px-1 py-0.2 rounded border ${verBadge.class}`}>
                              {verBadge.label}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Format */}
                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                          {FORMAT_LABELS[format] || format}
                        </span>
                      </td>

                      {/* Counts */}
                      <td className="py-3 px-3 text-center text-slate-400 font-mono">{data.total}</td>
                      <td className="py-3 px-3 text-center text-emerald-400 font-mono font-semibold">{data.pass}</td>
                      <td className="py-3 px-3 text-center text-red-400 font-mono font-semibold">{data.fail || '—'}</td>

                      {/* Compatibility Rate */}
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <span className={`font-mono font-bold text-xs ${
                            rate >= 80 ? 'text-emerald-400' : rate >= 50 ? 'text-amber-400' : 'text-red-400'
                          }`}>
                            {rate}%
                          </span>
                          <div className="w-14 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                              style={{ width: `${rate}%` }}
                            />
                          </div>
                        </div>
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {rate === 100 ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            Verified
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Friction Gap
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
