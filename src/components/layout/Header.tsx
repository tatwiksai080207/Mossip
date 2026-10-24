import React from 'react'
import type { NavTabId } from './Sidebar'
import { ThemeSelector } from './ThemeSelector'

interface HeaderProps {
  activeTab: NavTabId
}

const TAB_META: Record<NavTabId, { title: string }> = {
  runner: { title: 'Interop Studio' },
  history: { title: 'Run History' },
  matrix: { title: 'Interop Matrix' },
}

export const Header: React.FC<HeaderProps> = ({ activeTab }) => {
  const currentMeta = TAB_META[activeTab] || TAB_META.runner

  return (
    <header className="h-16 border-b border-app-border px-6 sm:px-8 bg-app-header backdrop-blur-md sticky top-0 z-30 transition-colors flex items-center shrink-0">
      <div className="flex items-center justify-between gap-4 w-full">
        {/* Dynamic Context Title based on selected Tab */}
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-app-text tracking-tight leading-tight">
            {currentMeta.title}
          </h2>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-2.5 shrink-0">
          <ThemeSelector />

          <a
            href="https://docs.inji.io/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-app-text-muted hover:text-app-text transition-colors inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-app-card border border-transparent hover:border-app-border"
          >
            <span>Docs</span>
            <svg className="w-3 h-3 text-app-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
          <a
            href="https://github.com/tatwiksai080207/Mossip"
            target="_blank"
            rel="noopener noreferrer"
            title="GitHub Repository"
            className="text-xs text-app-text-muted hover:text-app-text transition-colors inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-app-card border border-transparent hover:border-app-border"
          >
            <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 24 24">
              <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
            </svg>
            <span>GitHub</span>
          </a>
        </div>
      </div>
    </header>
  )
}

export default Header
