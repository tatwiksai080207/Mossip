import React from 'react'

interface RunHistoryStatsProps {
  releaseStats: Record<string, { total: number; pass: number; fail: number }>
  selectedVersion: string
  onSelectVersion: (version: string) => void
  getVersionBadge: (version?: string) => string
}

export const RunHistoryStats: React.FC<RunHistoryStatsProps> = ({
  releaseStats,
  selectedVersion,
  onSelectVersion,
  getVersionBadge,
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-4 sm:p-5 bg-slate-950/40 border-b border-slate-800">
      {Object.entries(releaseStats).map(([ver, stats]) => {
        const rate = Math.round((stats.pass / stats.total) * 100)
        const isSelected = selectedVersion === ver
        return (
          <button
            key={ver}
            onClick={() => onSelectVersion(selectedVersion === ver ? 'all' : ver)}
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
              <span className={`text-[11px] ${stats.fail === 0 ? 'text-emerald-500/80' : 'text-red-400/80'}`}>
                {stats.fail === 0 ? '0 Regressions' : `${stats.fail} gap(s)`}
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
  )
}
