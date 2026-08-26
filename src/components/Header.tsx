export default function Header() {
  return (
    <header className="border-b border-slate-800 px-6 py-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Inji Interoperability Playground</h1>
          <p className="text-sm text-slate-400">Verifiable Credential Lifecycle Testing</p>
        </div>
        <a
          href="https://docs.inji.io/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-slate-400 hover:text-slate-200"
        >
          Docs ↗
        </a>
      </div>
    </header>
  )
}
