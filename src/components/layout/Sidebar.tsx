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
    badge?: string
    icon: React.ReactNode
  }> = [
    {
      id: 'runner',
      label: 'Test Runner',
      badge: isTestActive ? 'Running' : undefined,
      icon: (
        <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'history',
      label: 'Run History',
      badge: totalRuns > 0 ? String(totalRuns) : undefined,
      icon: (
        <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
      ),
    },
    {
      id: 'matrix',
      label: 'Interop Matrix',
      badge: '4×4',
      icon: (
        <svg className="w-[22px] h-[22px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.85}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
        </svg>
      ),
    },
  ]

  return (
    <aside
      aria-label="Application navigation"
      className={`shrink-0 bg-app-sidebar border-r border-app-border backdrop-blur-xl flex flex-col justify-between h-screen sticky top-0 transition-all duration-300 z-40 select-none ${
        isCollapsed ? 'w-20' : 'w-64 lg:w-72'
      }`}
    >
      {/* Top Branding Section */}
      <div className="flex flex-col">
        <div className={`p-4 border-b border-app-border flex items-center ${isCollapsed ? 'justify-center' : 'justify-start'}`}>
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-app-accent shadow-md shadow-black/20 flex items-center justify-center shrink-0 border border-app-border-focus p-2">
              <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-white" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" fill="currentColor" fillOpacity={0.15} />
                <path d="m9 12 2 2 4-4" />
              </svg>
            </div>
            {!isCollapsed && (
              <h1 className="text-base font-bold text-app-text tracking-tight truncate">
                Inji Playground
              </h1>
            )}
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-3 space-y-1.5 mt-2">
          {navItems.map((item) => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3.5 px-3.5 py-3 rounded-xl text-left transition-all cursor-pointer ${
                  isActive
                    ? 'bg-app-accent text-white shadow-md font-semibold'
                    : 'text-app-text-muted hover:text-app-text hover:bg-app-card-hover font-medium'
                } ${isCollapsed ? 'justify-center px-0' : ''}`}
              >
                <div className={`shrink-0 flex items-center justify-center w-6 h-6 ${isActive ? 'text-white' : 'text-app-text-muted'}`}>
                  {item.icon}
                </div>

                {!isCollapsed && (
                  <div className="flex items-center justify-between flex-1 min-w-0">
                    <span className="text-sm leading-none font-medium truncate">{item.label}</span>

                    {item.badge && (
                      <span
                        className={`text-[11px] leading-none font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2 ${
                          isActive
                            ? 'bg-white/20 text-white'
                            : item.badge === 'Running'
                            ? 'bg-app-accent-subtle text-app-accent border border-app-border-focus animate-pulse'
                            : 'bg-app-card text-app-text-muted border border-app-border'
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
      <div className="p-3 space-y-2.5 border-t border-app-border">
        {/* Background Active Test Notice (if active and not on runner tab) */}
        {isTestActive && activeTab !== 'runner' && (
          <button
            type="button"
            onClick={() => onSelectTab('runner')}
            className={`w-full p-2.5 rounded-xl bg-app-accent-subtle/40 border border-app-border-focus text-app-accent hover:bg-app-accent-subtle transition-all flex items-center gap-2 cursor-pointer ${
              isCollapsed ? 'justify-center' : ''
            }`}
            title="A test is currently executing. Click to return to Test Runner."
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-app-accent opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-app-accent" />
            </span>
            {!isCollapsed && (
              <div className="text-left text-[11px] truncate">
                <span className="font-semibold block leading-tight text-app-text">Test Active</span>
                <span className="text-[10px] text-app-text-muted">Click to view execution</span>
              </div>
            )}
          </button>
        )}

        {/* Live Tunnel Card (when expanded) */}
        {!isCollapsed && tunnelUrl && (
          <div className="p-2.5 rounded-xl bg-app-card border border-app-border space-y-1.5">
            <div className="flex items-center justify-between text-[10px]">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>BFF Tunnel Live</span>
              </div>
              <button
                type="button"
                onClick={copyTunnel}
                className="text-[10px] px-2 py-0.5 rounded-md text-app-text-muted hover:text-app-text bg-app-base/70 hover:bg-app-card-hover border border-app-border transition-colors cursor-pointer flex items-center gap-1 font-medium shadow-2xs"
              >
                {copiedTunnel ? (
                  <>
                    <svg className="w-2.5 h-2.5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-emerald-400 font-sans">Copied</span>
                  </>
                ) : (
                  <>
                    <svg className="w-2.5 h-2.5 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    <span className="font-sans">Copy</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[10px] font-mono text-app-text-muted truncate bg-app-base/80 px-2 py-1 rounded border border-app-border">
              {tunnelUrl}
            </p>
          </div>
        )}

        {/* Collapse / Expand Toggle */}
        <button
          type="button"
          onClick={onToggleCollapse}
          className={`w-full flex items-center gap-2 py-2 px-3 rounded-lg text-app-text-muted hover:text-app-text hover:bg-app-card-hover transition-colors text-xs font-medium cursor-pointer ${
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
