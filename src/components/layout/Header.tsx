import React from 'react'
import type { NavTabId } from './Sidebar'

interface HeaderProps {
  activeTab: NavTabId
}

const TAB_META: Record<NavTabId, { title: string; subtitle: string }> = {
  runner: {
    title: 'Test Runner',
    subtitle: 'Select issuer, wallet, and verifier roles to execute tests',
  },
  history: {
    title: 'Run History',
    subtitle: 'Regression benchmarks, pass rates, and test telemetry',
  },
  matrix: {
    title: 'Interop Matrix',
    subtitle: 'Compatibility grid across MOSIP, walt.id, and Inji',
  },
}

export const Header: React.FC<HeaderProps> = ({ activeTab }) => {
  const currentMeta = TAB_META[activeTab] || TAB_META.runner

  return (
    <header className="border-b border-slate-800/80 px-6 sm:px-8 py-4 bg-slate-950/80 backdrop-blur-md sticky top-0 z-30">
      <div className="flex items-center justify-between gap-4">
        {/* Dynamic Context Title based on selected Tab */}
        <div>
          <h2 className="text-base sm:text-lg font-semibold text-white tracking-tight leading-tight">
            {currentMeta.title}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">
            {currentMeta.subtitle}
          </p>
        </div>

        {/* Global Action Badges & External Links */}
        <div className="flex items-center gap-3 sm:gap-4 shrink-0">
          <div className="hidden md:flex items-center gap-2">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/25">
              MOSIP Collab
            </span>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/25">
              Hackathon 2026
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <a
              href="https://docs.inji.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800"
            >
              <span>Docs</span>
              <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            <a
              href="https://github.com/mosip/inji"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-slate-400 hover:text-slate-200 transition-colors inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-900 border border-transparent hover:border-slate-800"
            >
              <span>GitHub</span>
              <svg className="w-3 h-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
