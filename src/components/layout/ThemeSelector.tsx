import React, { useState, useRef, useEffect } from 'react'
import { useTheme } from '../../context/ThemeContext'

export const ThemeSelector: React.FC = () => {
  const { currentTheme, setThemeId, availableThemes } = useTheme()
  const [isOpen, setIsOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handleOutsideClick = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleOutsideClick)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick)
    }
  }, [isOpen])

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        title="Switch color theme"
        className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs font-medium text-app-text-secondary hover:text-app-text bg-app-card hover:bg-app-card-hover border border-app-border hover:border-app-border-subtle transition-all cursor-pointer shadow-2xs"
      >
        {/* Color Palette Icon */}
        <svg className="w-3.5 h-3.5 text-app-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 21a4 4 0 01-4-4 11.95 11.95 0 014-8.5A11.95 11.95 0 0115.5 4 4 4 0 0121 8.5c0 1.25-.45 2.4-1.2 3.3a3.5 3.5 0 01-2.8 1.2h-1.5a1.5 1.5 0 00-1.5 1.5v.5a3.5 3.5 0 01-7 0v-1" />
        </svg>

        {/* Mini Preview Dot */}
        <span
          className="w-2 h-2 rounded-full ring-1 ring-white/20 shadow-xs"
          style={{ backgroundColor: currentTheme.previewColors.accent }}
        />

        <span className="hidden sm:inline-block truncate max-w-[110px]">{currentTheme.name}</span>

        {/* Chevron Icon */}
        <svg
          className={`w-3 h-3 text-app-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Classy & Modern Dropdown Menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-56 rounded-xl bg-app-sidebar/95 border border-app-border shadow-2xl shadow-black/60 p-1.5 z-50 animate-fade-in backdrop-blur-2xl">
          <div className="px-2.5 py-1.5 border-b border-app-border/70 mb-1 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-app-text-muted uppercase tracking-wider">
              Theme
            </span>
            <span className="text-[10px] text-app-text-muted font-mono">
              {availableThemes.length} presets
            </span>
          </div>

          <div className="space-y-0.5">
            {availableThemes.map((theme) => {
              const isSelected = theme.id === currentTheme.id
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => {
                    setThemeId(theme.id)
                    setIsOpen(false)
                  }}
                  className={`w-full flex items-center justify-between px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-app-accent-subtle/80 border border-app-border-focus text-app-text shadow-xs'
                      : 'hover:bg-app-card-hover border border-transparent text-app-text-secondary hover:text-app-text'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    {/* Check indicator */}
                    <div className="w-3.5 h-3.5 flex items-center justify-center shrink-0">
                      {isSelected ? (
                        <svg className="w-3.5 h-3.5 text-app-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-app-text-muted/40" />
                      )}
                    </div>
                    <span className="text-xs font-medium truncate">{theme.name}</span>
                  </div>

                  {/* Swatch Previews */}
                  <div className="flex items-center gap-1 shrink-0">
                    <span
                      className="w-3 h-3 rounded-full border border-white/15 shadow-xs"
                      style={{ backgroundColor: theme.previewColors.bg }}
                      title={`Background: ${theme.previewColors.bg}`}
                    />
                    <span
                      className="w-3 h-3 rounded-full border border-white/15 shadow-xs"
                      style={{ backgroundColor: theme.previewColors.surface }}
                      title={`Surface: ${theme.previewColors.surface}`}
                    />
                    <span
                      className="w-3 h-3 rounded-full border border-white/15 shadow-xs"
                      style={{ backgroundColor: theme.previewColors.accent }}
                      title={`Accent: ${theme.previewColors.accent}`}
                    />
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
