import { useStore } from '../store'

const FORMAT_LABELS: Record<string, string> = {
  'ldp_vc': 'W3C VC (JSON-LD)',
  'vc+sd-jwt': 'SD-JWT VC',
  'mso_mdoc': 'ISO 18013-5 mDoc',
}

export default function InteropMatrix() {
  const { history: runs } = useStore()

  if (!runs || runs.length === 0) return null

  // Build matrix: unique combos of issuer × wallet × verifier × format → results
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

  const entries = Object.entries(matrix)

  // Count live vs mock steps across all runs
  const totalLiveSteps = runs.reduce((acc, r) => acc + r.steps.filter(s => s.source === 'live').length, 0)
  const totalMockSteps = runs.reduce((acc, r) => acc + r.steps.filter(s => s.source === 'mock').length, 0)

  return (
    <div className="border border-slate-800 rounded-lg overflow-hidden">
      <div className="bg-slate-900 px-4 py-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-slate-200">Interoperability Matrix</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            {runs.length} run{runs.length !== 1 ? 's' : ''} across {entries.length} configuration{entries.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="text-green-400">{totalLiveSteps} live steps</span>
          <span className="text-yellow-400">{totalMockSteps} mock steps</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-slate-400">
              <th className="px-3 py-2 text-left font-medium">Issuer</th>
              <th className="px-3 py-2 text-left font-medium">Wallet</th>
              <th className="px-3 py-2 text-left font-medium">Verifier</th>
              <th className="px-3 py-2 text-left font-medium">Format</th>
              <th className="px-3 py-2 text-center font-medium">Runs</th>
              <th className="px-3 py-2 text-center font-medium">Pass</th>
              <th className="px-3 py-2 text-center font-medium">Fail</th>
              <th className="px-3 py-2 text-center font-medium">Rate</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(([key, data]) => {
              const [,,,format] = key.split('|')
              const run = data.runs[0]
              const rate = Math.round((data.pass / data.total) * 100)
              return (
                <tr key={key} className="border-b border-slate-800/50 hover:bg-slate-900/50">
                  <td className="px-3 py-2 text-slate-300">{run.config.issuer.name}</td>
                  <td className="px-3 py-2 text-slate-300">{run.config.wallet.name}</td>
                  <td className="px-3 py-2 text-slate-300">{run.config.verifier.name}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                      {FORMAT_LABELS[format] || format}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-center text-slate-400">{data.total}</td>
                  <td className="px-3 py-2 text-center text-green-400">{data.pass}</td>
                  <td className="px-3 py-2 text-center text-red-400">{data.fail || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <span className={`font-medium ${rate === 100 ? 'text-green-400' : rate > 50 ? 'text-yellow-400' : 'text-red-400'}`}>
                      {rate}%
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Export button */}
      <div className="px-4 py-2 border-t border-slate-800 flex justify-end">
        <button
          onClick={() => {
            const report = {
              generated: new Date().toISOString(),
              totalRuns: runs.length,
              liveSteps: totalLiveSteps,
              mockSteps: totalMockSteps,
              matrix: entries.map(([, data]) => {
                const run = data.runs[0]
                return {
                  issuer: run.config.issuer.name,
                  wallet: run.config.wallet.name,
                  verifier: run.config.verifier.name,
                  format: FORMAT_LABELS[run.config.credentialType.format] || run.config.credentialType.format,
                  runs: data.total,
                  passed: data.pass,
                  failed: data.fail,
                  rate: `${Math.round((data.pass / data.total) * 100)}%`,
                }
              }),
            }
            const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = `interop-report-${Date.now()}.json`
            a.click()
            URL.revokeObjectURL(url)
          }}
          className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
        >
          Export Report (JSON)
        </button>
      </div>
    </div>
  )
}
