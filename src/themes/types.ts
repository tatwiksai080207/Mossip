export interface ThemeTokens {
  // ── Canvas & Surface ────────────────────────
  bgBase: string
  bgSidebar: string
  bgHeader: string
  bgCard: string
  bgCardHover: string
  bgCardSelected: string

  // ── Borders ─────────────────────────────────
  borderBase: string
  borderSubtle: string
  borderFocus: string

  // ── Typography ──────────────────────────────
  textPrimary: string
  textSecondary: string
  textMuted: string
  textInverse: string

  // ── Accents & Actions ───────────────────────
  accent: string
  accentHover: string
  accentGlow: string
  accentSubtle: string

  // ── Status Indicators ───────────────────────
  statusSuccess: string
  statusSuccessBg: string
  statusSuccessBorder: string
  statusError: string
  statusErrorBg: string
  statusErrorBorder: string
  statusWarning: string
  statusWarningBg: string
  statusWarningBorder: string

  // ── Tamper & Negative Testing ───────────────
  tamper: string
  tamperBg: string
  tamperBorder: string

  // ── Environment Badges ──────────────────────
  badgeLocal: string
  badgeLocalBg: string
  badgeCollab: string
  badgeCollabBg: string
  badgeExternal: string
  badgeExternalBg: string
  badgeMock: string
  badgeMockBg: string
}

export interface ThemeDefinition {
  id: string
  name: string
  description: string
  isDark: boolean
  previewColors: {
    bg: string
    surface: string
    accent: string
  }
  tokens: ThemeTokens
}
