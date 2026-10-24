import React from 'react'

interface RunHistoryFiltersProps {
  selectedVersion: string
  setSelectedVersion: (val: string) => void
  availableVersions: string[]
  selectedFormat: string
  setSelectedFormat: (val: string) => void
  selectedOutcome: string
  setSelectedOutcome: (val: string) => void
  searchQuery: string
  setSearchQuery: (val: string) => void
  hasActiveFilters: boolean
  onResetFilters: () => void
  totalCount: number
  filteredCount: number
  onExportFilteredJSON: () => void
}

export const RunHistoryFilters: React.FC<RunHistoryFiltersProps> = ({
  selectedVersion,
  setSelectedVersion,
  availableVersions,
  selectedFormat,
  setSelectedFormat,
  selectedOutcome,
  setSelectedOutcome,
  searchQuery,
  setSearchQuery,
  hasActiveFilters,
  onResetFilters,
  totalCount,
  filteredCount,
  onExportFilteredJSON,
}) => {
  return (
    <div className="p-4 sm:p-5 border-b border-app-border bg-app-base/60 flex flex-wrap items-center justify-between gap-4">
      {/* Left side: Search & Filter Controls */}
      <div className="flex flex-wrap items-center gap-3 flex-1 min-w-0">
        {/* Prominent Search Input with Icon */}
        <div className="relative flex-1 min-w-[260px] max-w-md">
          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-app-text-muted">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search by issuer, wallet, verifier, or format..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-9 py-2.5 bg-app-card border border-app-border hover:border-app-border-subtle rounded-xl text-sm text-app-text placeholder:text-app-text-muted focus:outline-none focus:ring-2 focus:ring-app-accent/40 focus:border-app-accent transition-all shadow-inner"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-app-text-muted hover:text-app-text cursor-pointer"
              title="Clear search"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Release Filter Dropdown */}
        <div className="flex items-center gap-2 bg-app-card border border-app-border hover:border-app-border-subtle rounded-xl px-3.5 py-2 transition-colors">
          <span className="text-xs text-app-text-muted font-semibold uppercase tracking-wider">Release:</span>
          <select
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            className="bg-transparent text-sm font-medium text-app-text focus:outline-none cursor-pointer pr-1"
          >
            <option value="all" className="bg-app-card text-app-text">All Releases</option>
            {availableVersions.map((v) => (
              <option key={v} value={v} className="bg-app-card text-app-text">
                {v}
              </option>
            ))}
          </select>
        </div>

        {/* Format Filter Dropdown */}
        <div className="flex items-center gap-2 bg-app-card border border-app-border hover:border-app-border-subtle rounded-xl px-3.5 py-2 transition-colors">
          <span className="text-xs text-app-text-muted font-semibold uppercase tracking-wider">Format:</span>
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="bg-transparent text-sm font-medium text-app-text focus:outline-none cursor-pointer pr-1"
          >
            <option value="all" className="bg-app-card text-app-text">All Formats</option>
            <option value="ldp_vc" className="bg-app-card text-app-text">W3C VC (JSON-LD)</option>
            <option value="vc+sd-jwt" className="bg-app-card text-app-text">SD-JWT VC</option>
            <option value="mso_mdoc" className="bg-app-card text-app-text">ISO 18013-5 mDoc</option>
          </select>
        </div>

        {/* Outcome Filter Dropdown */}
        <div className="flex items-center gap-2 bg-app-card border border-app-border hover:border-app-border-subtle rounded-xl px-3.5 py-2 transition-colors">
          <span className="text-xs text-app-text-muted font-semibold uppercase tracking-wider">Outcome:</span>
          <select
            value={selectedOutcome}
            onChange={(e) => setSelectedOutcome(e.target.value)}
            className="bg-transparent text-sm font-medium text-app-text focus:outline-none cursor-pointer pr-1"
          >
            <option value="all" className="bg-app-card text-app-text">All Outcomes</option>
            <option value="pass" className="bg-app-card text-app-text">PASS Only</option>
            <option value="fail" className="bg-app-card text-app-text">FAIL Only</option>
          </select>
        </div>

        {/* Clear/Reset Active Filters Button */}
        {hasActiveFilters && (
          <button
            onClick={onResetFilters}
            className="px-3 py-2 text-xs font-semibold text-app-accent hover:opacity-80 hover:bg-app-accent-subtle rounded-xl border border-app-accent/20 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            <span>Reset Filters</span>
          </button>
        )}
      </div>

      {/* Right side: Count & Export Action */}
      <div className="flex items-center gap-3.5 shrink-0 text-sm">
        <div className="text-xs text-app-text-muted font-medium hidden sm:block">
          Showing <span className="text-app-text font-bold">{filteredCount}</span> of {totalCount} runs
        </div>

        <button
          onClick={onExportFilteredJSON}
          disabled={filteredCount === 0}
          className="px-4 py-2 rounded-xl bg-app-card hover:bg-app-card-hover text-app-text-secondary hover:text-app-text border border-app-border font-medium text-xs sm:text-sm flex items-center gap-2 transition-all shadow-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title="Export current filtered test runs as JSON"
        >
          <svg className="w-4 h-4 text-app-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          <span>Export JSON</span>
        </button>
      </div>
    </div>
  )
}
export default RunHistoryFilters
