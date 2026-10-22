import React, { useState } from 'react'

export type NavTabId = 'runner' | 'history' | 'matrix'

interface SidebarProps {
  activeTab: NavTabId
  onSelectTab: (tab: NavTabId) => void
  isCollapsed: boolean
  onToggleCollapse: () => void
  tunnelUrl: string
  isTestActive: boolean
  totalRuns: number
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  isCollapsed,
  onToggleCollapse,
  tunnelUrl,
  isTestActive,
  totalRuns,
}) => {
  const [copiedTunnel, setCopiedTunnel] = useState(false)

  const copyTunnel = () => {
    if (!tunnelUrl) return
    navigator.clipboard.writeText(tunnelUrl)
    setCopiedTunnel(true)
    setTimeout(() => setCopiedTunnel(false), 2000)
  }

  const navItems: Array<{
    id: NavTabId
    label: string
    sublabel: string
    badge?: string
    icon: React.ReactNode
  }> = [
    {
      id: 'runner',
      label: 'Test Runner',
      sublabel: 'Configure & Execute',
      badge: isTestActive ? 'Running' : undefined,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'history',
      label: 'Run History',
      sublabel: 'KPIs & Regressions',
      badge: totalRuns > 0 ? String(totalRuns) : undefined,
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: 'matrix',
      label: 'Interop Matrix',
      sublabel: 'Cross-Ecosystem Grid',
      badge: '4×4',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
  ]

  return (
    <aside
      aria-label="Application navigation"
      className={`shrink-0 bg-slate-900/95 border-r border-slate-800/80 backdrop-blur-xl flex flex-col justify-between h-screen sticky top-0 transition-all duration-300 z-40 select-none ${
        isCollapsed ? 'w-20' : 'w-64 lg:w-72'
      }`}
    >
      {/* Top Branding Section */}
      <div className="flex flex-col">
        <div className={`p-4 border-b border-slate-800/80 flex items-center ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
          <div className="flex items-center gap-3 overflow-hidden">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 shadow-md shadow-blue-500/20 flex items-center justify-center text-white font-bold text-base shrink-0 border border-blue-400/30">
              I
            </div>
            {!isCollapsed && (
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-bold text-white tracking-tight truncate">Inji Playground</h1>
                  <span className="text-[10px] font-semibold px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                    v0.17
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate">Interoperability Studio</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1.5 mt-2">
          {!isCollapsed && (
            <p className="px-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Navigation
            </p>
          )}

          {navItems.map((item) => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3.5 px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/25 font-semibold'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 font-medium'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
              >
                <div className={`shrink-0 ${isActive ? 'text-white' : 'text-slate-400'}`}>
                  {item.icon}
                </div>

                {!isCollapsed && (
                  <div className="flex items-center justify-between flex-1 min-w-0">
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs truncate">{item.label}</span>
                      <span className={`text-[10px] truncate ${isActive ? 'text-blue-100/80' : 'text-slate-500'}`}>
                        {item.sublabel}
                      </span>
                    </div>

                    {item.badge && (
                      <span
                        className={`text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2 ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : item.badge === 'Running'
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                            : 'bg-slate-800 text-slate-300 border border-slate-700'
                        }`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </div>
                )}
              </button>
            )
          })}
        </nav>
      </div>

      {/* Bottom Section: Active Run Notice, Tunnel Status & Collapse Toggle */}
      <div className="p-3 space-y-2.5 border-t border-slate-800/80">
        {/* Background Active Test Notice (if active and not on runner tab) */}
        {isTestActive && activeTab !== 'runner' && (
          <button
            type="button"
            onClick={() => onSelectTab('runner')}
            className={`w-full p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 transition-all flex items-center gap-2 cursor-pointer ${
              isCollapsed ? 'justify-center' : ''
            }`}
            title="A test is currently executing. Click to return to Test Runner."
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
            </span>
            {!isCollapsed && (
              <div className="text-left text-[11px] truncate">
                <span className="font-semibold block leading-tight">Test Active</span>
                <span className="text-[10px] text-amber-400/80">Click to view execution</span>
              </div>
            )}
          </button>
        )}

        {/* Live Tunnel Card (when expanded) */}
        {!isCollapsed && tunnelUrl && (
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/90 space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>BFF Tunnel Live</span>
              </div>
              <button
                type="button"
                onClick={copyTunnel}
                className="text-[10px] text-blue-400 hover:text-blue-300 font-medium cursor-pointer"
              >
                {copiedTunnel ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <p className="text-[10px] font-mono text-slate-400 truncate bg-slate-900/80 px-2 py-1 rounded border border-slate-800">
              {tunnelUrl}
            </p>
          </div>
        )}

        {/* Collapse / Expand Toggle */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`w-full flex items-center gap-2 py-2 px-3 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors text-xs font-medium cursor-pointer ${
            isCollapsed ? 'justify-center px-0' : 'justify-between'
          }`}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {!isCollapsed && <span>Collapse Sidebar</span>}
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
          </svg>
        </button>
      </div>
    </aside>
  )
}

export default Sidebar
