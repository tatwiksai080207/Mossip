import type { ThemeDefinition } from './types'
import { currentMidnightTheme } from './current-midnight'
import { linearObsidianTheme } from './linear-obsidian'

export * from './types'
export { currentMidnightTheme } from './current-midnight'
export { linearObsidianTheme } from './linear-obsidian'

export const AVAILABLE_THEMES: ThemeDefinition[] = [
  currentMidnightTheme,
  linearObsidianTheme,
]

export const DEFAULT_THEME_ID = currentMidnightTheme.id

export function getThemeById(id: string): ThemeDefinition {
  return AVAILABLE_THEMES.find(t => t.id === id) || currentMidnightTheme
}

/**
 * Injects the theme tokens as CSS custom properties on document.documentElement
 */
export function applyThemeTokens(theme: ThemeDefinition): void {
  if (typeof document === 'undefined') return

  const root = document.documentElement
  const { tokens } = theme

  // Canvas & Surfaces
  root.style.setProperty('--app-bg-base', tokens.bgBase)
  root.style.setProperty('--app-bg-sidebar', tokens.bgSidebar)
  root.style.setProperty('--app-bg-header', tokens.bgHeader)
  root.style.setProperty('--app-bg-card', tokens.bgCard)
  root.style.setProperty('--app-bg-card-hover', tokens.bgCardHover)
  root.style.setProperty('--app-bg-card-selected', tokens.bgCardSelected)

  // Borders
  root.style.setProperty('--app-border-base', tokens.borderBase)
  root.style.setProperty('--app-border-subtle', tokens.borderSubtle)
  root.style.setProperty('--app-border-focus', tokens.borderFocus)

  // Typography
  root.style.setProperty('--app-text-primary', tokens.textPrimary)
  root.style.setProperty('--app-text-secondary', tokens.textSecondary)
  root.style.setProperty('--app-text-muted', tokens.textMuted)
  root.style.setProperty('--app-text-inverse', tokens.textInverse)

  // Accents
  root.style.setProperty('--app-accent', tokens.accent)
  root.style.setProperty('--app-accent-hover', tokens.accentHover)
  root.style.setProperty('--app-accent-glow', tokens.accentGlow)
  root.style.setProperty('--app-accent-subtle', tokens.accentSubtle)

  // Status Indicators
  root.style.setProperty('--app-status-success', tokens.statusSuccess)
  root.style.setProperty('--app-status-success-bg', tokens.statusSuccessBg)
  root.style.setProperty('--app-status-success-border', tokens.statusSuccessBorder)

  root.style.setProperty('--app-status-error', tokens.statusError)
  root.style.setProperty('--app-status-error-bg', tokens.statusErrorBg)
  root.style.setProperty('--app-status-error-border', tokens.statusErrorBorder)

  root.style.setProperty('--app-status-warning', tokens.statusWarning)
  root.style.setProperty('--app-status-warning-bg', tokens.statusWarningBg)
  root.style.setProperty('--app-status-warning-border', tokens.statusWarningBorder)

  // Tamper & Negative Testing
  root.style.setProperty('--app-tamper', tokens.tamper)
  root.style.setProperty('--app-tamper-bg', tokens.tamperBg)
  root.style.setProperty('--app-tamper-border', tokens.tamperBorder)

  // Environment Badges
  root.style.setProperty('--app-badge-local', tokens.badgeLocal)
  root.style.setProperty('--app-badge-local-bg', tokens.badgeLocalBg)
  root.style.setProperty('--app-badge-collab', tokens.badgeCollab)
  root.style.setProperty('--app-badge-collab-bg', tokens.badgeCollabBg)
  root.style.setProperty('--app-badge-external', tokens.badgeExternal)
  root.style.setProperty('--app-badge-external-bg', tokens.badgeExternalBg)
  root.style.setProperty('--app-badge-mock', tokens.badgeMock)
  root.style.setProperty('--app-badge-mock-bg', tokens.badgeMockBg)

  // Set data-theme on root for CSS targeting
  root.setAttribute('data-theme', theme.id)
}
