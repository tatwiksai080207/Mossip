export default function Header() {
  return (
    <header className="border-b border-slate-800 px-4 sm:px-8 py-4 bg-slate-950">
      <div className="max-w-[1720px] mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-md bg-blue-600 flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
            I
          </div>
          <div>
            <h1 className="text-base font-semibold text-white leading-tight">Inji Interoperability Playground</h1>
            <p className="text-xs text-slate-400">OpenID4VCI · OpenID4VP · W3C VC · SD-JWT</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 border border-green-500/20">
              MOSIP Collab
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Hackathon 2026
            </span>
          </div>
          <div className="flex items-center gap-3">
            <a
              href="https://docs.inji.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Docs ↗
            </a>
            <a
              href="https://github.com/mosip/inji"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              GitHub ↗
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}
