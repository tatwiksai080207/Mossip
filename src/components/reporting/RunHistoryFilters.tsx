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
    <div className="p-4 border-b border-slate-800 bg-slate-900/20 flex flex-wrap items-center justify-between gap-3 text-xs">
      <div className="flex flex-wrap items-center gap-2.5">
        {/* Release Filter */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5">
          <span className="text-slate-500 font-medium">Release:</span>
          <select
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-slate-900">All Releases</option>
            {availableVersions.map(v => (
              <option key={v} value={v} className="bg-slate-900">{v}</option>
            ))}
          </select>
        </div>

        {/* Format Filter */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5">
          <span className="text-slate-500 font-medium">Format:</span>
          <select
            value={selectedFormat}
            onChange={(e) => setSelectedFormat(e.target.value)}
            className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-slate-900">All Formats</option>
            <option value="ldp_vc" className="bg-slate-900">W3C VC (JSON-LD)</option>
            <option value="vc+sd-jwt" className="bg-slate-900">SD-JWT VC</option>
            <option value="mso_mdoc" className="bg-slate-900">ISO 18013-5 mDoc</option>
          </select>
        </div>

        {/* Outcome Filter */}
        <div className="flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5">
          <span className="text-slate-500 font-medium">Outcome:</span>
          <select
            value={selectedOutcome}
            onChange={(e) => setSelectedOutcome(e.target.value)}
            className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
          >
            <option value="all" className="bg-slate-900">All Outcomes</option>
            <option value="pass" className="bg-slate-900 text-emerald-400">PASS</option>
            <option value="fail" className="bg-slate-900 text-red-400">FAIL</option>
          </select>
        </div>

        {/* Search Input */}
        <input
          type="text"
          placeholder="Search runs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-slate-700 w-40 sm:w-52"
        />

        {hasActiveFilters && (
          <button
            onClick={onResetFilters}
            className="px-2.5 py-1 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors cursor-pointer"
          >
            Reset Filters
          </button>
        )}
      </div>

      <div className="flex items-center gap-3 text-slate-400">
        <span>Showing <strong>{filteredCount}</strong> of {totalCount} runs</span>
        <button
          onClick={onExportFilteredJSON}
          disabled={filteredCount === 0}
          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
        >
          Export JSON
        </button>
      </div>
    </div>
  )
}
