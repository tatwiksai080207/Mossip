import React from 'react'
import { FORMAT_LABELS, ENV_BADGES } from './types'

interface MatrixGridViewProps {
  issuers: any[]
  verifiers: any[]
  cellMap: Record<string, Record<string, { pass: number; total: number; runs: any[] }>>
  selectedFormat: string
  activeCellKey: string | null
  onSelectCell: (key: string | null) => void
  activeCellData: {
    issuer: any
    verifier: any
    formats: Record<string, { pass: number; total: number; runs: any[] }>
  } | null
}

export const MatrixGridView: React.FC<MatrixGridViewProps> = ({
  issuers,
  verifiers,
  cellMap,
  selectedFormat,
  activeCellKey,
  onSelectCell,
  activeCellData,
}) => {
  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {/* Corner Cell */}
              <th className="p-4 text-left bg-app-base/80 border border-app-border rounded-tl-xl w-64 min-w-[240px]">
                <span className="text-xs font-semibold text-app-text-muted uppercase tracking-wider block">
                  Issuer \ Verifier
                </span>
                <span className="text-[11px] text-app-text-muted font-normal mt-0.5 block">
                  Cross-ecosystem pairing
                </span>
              </th>

              {/* Column Headers (Verifiers) */}
              {verifiers.map((ver, idx) => {
                const envBadge = ENV_BADGES[ver.env || 'local']
                return (
                  <th
                    key={ver.id}
                    className={`p-4 text-left bg-app-base/80 border border-app-border min-w-[280px] ${
                      idx === verifiers.length - 1 ? 'rounded-tr-xl' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-app-text tracking-tight">{ver.name}</h4>
                      {envBadge && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${envBadge.class}`}>
                          {envBadge.label}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-app-text-muted mt-0.5 font-normal">{ver.description}</p>
                  </th>
                )
              })}
            </tr>
          </thead>

          <tbody className="divide-y divide-app-border/80">
            {issuers.map((iss) => {
              const issBadge = ENV_BADGES[iss.env || 'local']

              return (
                <tr key={iss.id} className="transition-colors">
                  {/* Row Header (Issuer) */}
                  <th className="p-4 text-left bg-app-base/60 border border-app-border align-top">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-semibold text-app-text tracking-tight">{iss.name}</h4>
                      {issBadge && (
                        <span className={`text-[10px] font-bold px-1.5 py-0.2 rounded border ${issBadge.class}`}>
                          {issBadge.label}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-app-text-muted mt-0.5 font-normal">{iss.description}</p>
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
                        onClick={() => hasData && onSelectCell(isSelected ? null : cellKey)}
                        className={`p-3.5 border border-app-border align-top transition-all ${
                          isSelected
                            ? 'bg-app-accent-subtle ring-2 ring-app-accent/50'
                            : hasData
                            ? 'bg-app-card/40 hover:bg-app-card/80 cursor-pointer'
                            : 'bg-app-base/20'
                        }`}
                      >
                        {!hasData || activeFormatKeys.length === 0 ? (
                          <div className="py-6 text-center text-app-text-muted text-xs font-mono">
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
                                  className="p-2.5 rounded-lg bg-app-base/70 border border-app-border text-xs space-y-1.5"
                                >
                                  <div className="flex items-center justify-between gap-1">
                                    <span className="font-semibold text-app-text text-[11px] truncate">
                                      {FORMAT_LABELS[fmt] || fmt}
                                    </span>
                                    <span
                                      className={`font-bold px-1.5 py-0.2 rounded text-[10px] shrink-0 ${
                                        rate >= 80
                                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                                          : rate >= 50
                                          ? 'bg-app-accent-subtle text-app-accent border border-app-border-focus'
                                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                                      }`}
                                    >
                                      {rate}% ({fmtStats.total})
                                    </span>
                                  </div>

                                  {/* Progress bar */}
                                  <div className="h-1 w-full bg-app-card rounded-full overflow-hidden">
                                    <div
                                      className={`h-full ${
                                        rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-app-accent' : 'bg-rose-500'
                                      }`}
                                      style={{ width: `${rate}%` }}
                                    />
                                  </div>

                                  {/* Discovered Friction Point Badges */}
                                  {isSdJwtX5cGap && (
                                    <div className="text-[10px] font-medium text-app-accent bg-app-accent-subtle/50 border border-app-border-focus px-1.5 py-0.5 rounded flex items-center gap-1">
                                      <span>▲</span>
                                      <span>x5c Certificate Chain Enforced</span>
                                    </div>
                                  )}
                                  {isMdocDcqlGap && (
                                    <div className="text-[10px] font-medium text-app-accent bg-app-accent-subtle/50 border border-app-border-focus px-1.5 py-0.5 rounded flex items-center gap-1">
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
        <div className="p-4 sm:p-5 rounded-xl bg-app-card border border-app-accent/40 shadow-xl space-y-3 animate-fade-in">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-bold text-app-text">Pairing Details</h4>
              <span className="text-xs text-app-text-secondary">
                {activeCellData.issuer?.name} → {activeCellData.verifier?.name}
              </span>
            </div>
            <button
              onClick={() => onSelectCell(null)}
              className="text-xs text-app-text-muted hover:text-app-text px-2 py-1 rounded bg-app-base hover:bg-app-card border border-app-border transition-colors cursor-pointer"
            >
              Close
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {Object.entries(activeCellData.formats || {}).map(([fmt, stats]) => (
              <div key={fmt} className="p-3 rounded-lg bg-app-base border border-app-border text-xs">
                <div className="font-semibold text-app-text">{FORMAT_LABELS[fmt] || fmt}</div>
                <div className="text-app-text-muted mt-1 flex items-center justify-between">
                  <span>Pass Rate:</span>
                  <strong className="text-app-text">
                    {Math.round((stats.pass / stats.total) * 100)}% ({stats.pass}/{stats.total})
                  </strong>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
