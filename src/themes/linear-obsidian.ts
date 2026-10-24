import type { ThemeDefinition } from './types'

export const linearObsidianTheme: ThemeDefinition = {
  id: 'linear-obsidian',
  name: 'Linear Obsidian',
  description: 'Minimalist deep neutral zinc black with electric indigo accents',
  isDark: true,
  previewColors: {
    bg: '#09090b',
    surface: '#18181b',
    accent: '#6366f1',
  },
  tokens: {
    // ── Canvas & Surface ────────────────────────
    bgBase: '#09090b',          // zinc-950
    bgSidebar: '#121215',       // obsidian charcoal
    bgHeader: '#09090bcc',
    bgCard: '#18181bcc',        // zinc-900/80
    bgCardHover: '#27272acc',   // zinc-800/80
    bgCardSelected: '#6366f11a', // indigo-500/10

    // ── Borders ─────────────────────────────────
    borderBase: '#27272a',      // zinc-800
    borderSubtle: '#3f3f46',    // zinc-700
    borderFocus: '#6366f1',     // indigo-500

    // ── Typography ──────────────────────────────
    textPrimary: '#fafafa',     // zinc-50
    textSecondary: '#a1a1aa',   // zinc-400
    textMuted: '#71717a',       // zinc-500
    textInverse: '#ffffff',

    // ── Accents & Actions ───────────────────────
    accent: '#6366f1',          // indigo-500
    accentHover: '#4f46e5',     // indigo-600
    accentGlow: 'rgba(99, 102, 241, 0.25)',
    accentSubtle: '#6366f126',

    // ── Status Indicators ───────────────────────
    statusSuccess: '#10b981',       // emerald-500
    statusSuccessBg: '#10b98120',
    statusSuccessBorder: '#10b98135',
    statusError: '#f43f5e',         // rose-500
    statusErrorBg: '#f43f5e20',
    statusErrorBorder: '#f43f5e35',
    statusWarning: '#fb923c',       // classy muted coral/orange (avoiding garish yellow)
    statusWarningBg: '#fb923c18',
    statusWarningBorder: '#fb923c30',

    // ── Tamper & Negative Testing ───────────────
    tamper: '#c084fc',              // sleek electric violet
    tamperBg: '#c084fc18',
    tamperBorder: '#c084fc35',

    // ── Environment Badges ──────────────────────
    badgeLocal: '#10b981',          // emerald-500
    badgeLocalBg: '#10b98120',
    badgeCollab: '#a855f7',         // purple-500
    badgeCollabBg: '#a855f720',
    badgeExternal: '#818cf8',       // indigo-400
    badgeExternalBg: '#6366f120',
    badgeMock: '#94a3b8',           // slate-400
    badgeMockBg: '#94a3b820',
  },
}
