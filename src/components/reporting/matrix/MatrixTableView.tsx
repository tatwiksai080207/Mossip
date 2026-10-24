import React from 'react'
import { FORMAT_LABELS, ENV_BADGES } from './types'

interface MatrixTableViewProps {
  filteredEntries: Array<[string, { pass: number; fail: number; total: number; runs: any[] }]>
}

export const MatrixTableView: React.FC<MatrixTableViewProps> = ({ filteredEntries }) => {
  return (
    <div className="w-full flex-1 overflow-x-auto">
      <table className="w-full text-left text-xs border-collapse">
        <thead className="bg-app-base/80 border-b border-app-border text-[11px] font-semibold text-app-text-muted uppercase tracking-wider sticky top-0 backdrop-blur-md">
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
        <tbody className="divide-y divide-app-border/60 font-sans">
          {filteredEntries.map(([key, data]) => {
            const [, , , format] = key.split('|')
            const run = data.runs[0]
            const rate = Math.round((data.pass / data.total) * 100)
            const issBadge = ENV_BADGES[run.config.issuer.env || 'local']
            const verBadge = ENV_BADGES[run.config.verifier.env || 'local']

            return (
              <tr key={key} className="hover:bg-app-card-hover/50 transition-colors">
                {/* Issuer */}
                <td className="py-3 px-4 text-app-text font-medium">
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
                <td className="py-3 px-3 text-app-text-secondary font-medium">
                  {run.config.wallet.name}
                </td>

                {/* Verifier */}
                <td className="py-3 px-3 text-app-text font-medium">
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
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-app-base text-app-text border border-app-border">
                    {FORMAT_LABELS[format] || format}
                  </span>
                </td>

                {/* Counts */}
                <td className="py-3 px-3 text-center text-app-text-muted font-mono">{data.total}</td>
                <td className="py-3 px-3 text-center text-emerald-400 font-mono font-semibold">{data.pass}</td>
                <td className="py-3 px-3 text-center text-rose-400 font-mono font-semibold">{data.fail || '—'}</td>

                {/* Compatibility Rate */}
                <td className="py-3 px-3 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span
                      className={`font-mono font-bold text-xs ${
                        rate >= 80 ? 'text-emerald-400' : rate >= 50 ? 'text-app-accent' : 'text-rose-400'
                      }`}
                    >
                      {rate}%
                    </span>
                    <div className="w-14 h-1.5 bg-app-base rounded-full overflow-hidden">
                      <div
                        className={`h-full ${rate >= 80 ? 'bg-emerald-500' : rate >= 50 ? 'bg-app-accent' : 'bg-rose-500'}`}
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
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-app-accent-subtle text-app-accent border border-app-border-focus">
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
  )
}
