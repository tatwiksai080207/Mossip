import { useStore } from '../store'

export default function RunHistory() {
  const { history, clearHistory } = useStore()

  if (history.length === 0) return null

  return (
    <div className="border border-slate-800 rounded-lg">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
        <h3 className="text-sm font-medium text-slate-300">
          Run History
          <span className="ml-2 text-xs text-slate-500">({history.length})</span>
        </h3>
        <button
          onClick={clearHistory}
          className="text-xs text-slate-500 hover:text-slate-300"
        >
          Clear
        </button>
      </div>

      <div className="divide-y divide-slate-800/50">
        {history.map((run) => (
          <div key={run.id} className="px-4 py-3 flex items-center justify-between text-sm">
            <div className="space-y-0.5">
              <div className="text-slate-300">
                {run.config.issuer.name} → {run.config.wallet.name} → {run.config.verifier.name}
              </div>
              <div className="text-xs text-slate-500">
                {run.config.credentialType.name} · {new Date(run.timestamp).toLocaleTimeString()}
              </div>
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded ${
              run.result === 'pass'
                ? 'bg-green-500/10 text-green-400'
                : 'bg-red-500/10 text-red-400'
            }`}>
              {run.result.toUpperCase()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
