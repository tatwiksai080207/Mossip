import React from 'react'

interface RunHistoryStatsProps {
  totalRuns: number
  overallPassRate: number
  avgLatencySec: string
  totalGaps: number
  releaseStats: Record<string, { total: number; pass: number; fail: number }>
  selectedVersion: string
  onSelectVersion: (version: string) => void
}

export const RunHistoryStats: React.FC<RunHistoryStatsProps> = ({
  totalRuns,
  overallPassRate,
  avgLatencySec,
  totalGaps,
  releaseStats,
  selectedVersion,
  onSelectVersion,
}) => {
  return (
    <div className="p-4 sm:p-5 border-b border-app-border bg-app-base/40 space-y-4">
      {/* 1. Top 4 Metric KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Card 1: Total Runs */}
        <div className="p-4 rounded-xl bg-app-card border border-app-border hover:border-app-border-subtle transition-colors">
          <div className="flex items-center justify-between text-app-text-muted text-xs">
            <span className="font-medium uppercase tracking-wider text-[11px]">Total Runs</span>
            <div className="w-6 h-6 rounded-lg bg-app-accent-subtle text-app-accent flex items-center justify-center">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-app-text mt-1 tracking-tight">{totalRuns}</div>
          <p className="text-[11px] text-app-text-muted mt-1">Lifecycle executions recorded</p>
        </div>

        {/* Card 2: Pass Rate */}
        <div className="p-4 rounded-xl bg-app-card border border-app-border hover:border-app-border-subtle transition-colors">
          <div className="flex items-center justify-between text-app-text-muted text-xs">
            <span className="font-medium uppercase tracking-wider text-[11px]">Overall Pass Rate</span>
            <div className="w-6 h-6 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className={`text-2xl font-bold tracking-tight ${
              overallPassRate >= 80 ? 'text-emerald-400' : overallPassRate >= 60 ? 'text-app-accent' : 'text-rose-400'
            }`}>
              {overallPassRate}%
            </span>
            <span className="text-xs text-app-text-muted">benchmark</span>
          </div>
          <div className="mt-2 h-1.5 w-full bg-app-base rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                overallPassRate >= 80 ? 'bg-emerald-500' : overallPassRate >= 60 ? 'bg-app-accent' : 'bg-rose-500'
              }`}
              style={{ width: `${overallPassRate}%` }}
            />
          </div>
        </div>

        {/* Card 3: Avg Latency */}
        <div className="p-4 rounded-xl bg-app-card border border-app-border hover:border-app-border-subtle transition-colors">
          <div className="flex items-center justify-between text-app-text-muted text-xs">
            <span className="font-medium uppercase tracking-wider text-[11px]">Avg Protocol Latency</span>
            <div className="w-6 h-6 rounded-lg bg-app-accent-subtle text-app-accent flex items-center justify-center">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <circle cx="12" cy="12" r="9" strokeWidth="2" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 7v5l3 3" />
              </svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-app-text mt-1 tracking-tight font-mono">{avgLatencySec}</div>
          <p className="text-[11px] text-app-text-muted mt-1">OpenID4VCI + OpenID4VP flow</p>
        </div>

        {/* Card 4: Interop Gaps */}
        <div className="p-4 rounded-xl bg-app-card border border-app-border hover:border-app-border-subtle transition-colors">
          <div className="flex items-center justify-between text-app-text-muted text-xs">
            <span className="font-medium uppercase tracking-wider text-[11px]">Interop Gaps</span>
            <div className="w-6 h-6 rounded-lg bg-app-accent-subtle text-app-accent flex items-center justify-center">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
          </div>
          <div className="text-2xl font-bold text-app-accent mt-1 tracking-tight">{totalGaps}</div>
          <p className="text-[11px] text-app-text-muted mt-1">Discovered specification frictions</p>
        </div>
      </div>

      {/* 2. Interactive Release Version Filter Pills */}
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <span className="text-xs text-app-text-muted font-medium mr-1">Release Baselines:</span>
        <button
          onClick={() => onSelectVersion('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
            selectedVersion === 'all'
              ? 'bg-app-accent text-white border-app-accent shadow-sm shadow-app-accent/30'
              : 'bg-app-card hover:bg-app-card-hover text-app-text-secondary border-app-border'
          }`}
        >
          All Runs ({totalRuns})
        </button>

        {Object.entries(releaseStats).map(([ver, stats]) => {
          const rate = Math.round((stats.pass / stats.total) * 100)
          const isSelected = selectedVersion === ver
          return (
            <button
              key={ver}
              onClick={() => onSelectVersion(isSelected ? 'all' : ver)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer flex items-center gap-2 ${
                isSelected
                  ? 'bg-app-accent text-white border-app-accent shadow-sm shadow-app-accent/30'
                  : 'bg-app-card hover:bg-app-card-hover text-app-text-secondary border-app-border'
              }`}
            >
              <span>Release {ver}</span>
              <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded ${
                isSelected
                  ? 'bg-white/20 text-white'
                  : rate >= 80 ? 'bg-emerald-500/20 text-emerald-300' : rate >= 60 ? 'bg-app-accent-subtle text-app-accent' : 'bg-rose-500/20 text-rose-300'
              }`}>
                {rate}% ({stats.total})
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
