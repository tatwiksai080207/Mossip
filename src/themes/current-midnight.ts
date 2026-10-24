import type { ThemeDefinition } from './types'

export const currentMidnightTheme: ThemeDefinition = {
  id: 'current-midnight',
  name: 'Inji Midnight',
  description: 'Original blue-slate dark mode with royal blue accents',
  isDark: true,
  previewColors: {
    bg: '#020617',
    surface: '#0f172a',
    accent: '#2563eb',
  },
  tokens: {
    // ── Canvas & Surface ────────────────────────
    bgBase: '#020617',          // slate-950
    bgSidebar: '#0f172a',       // slate-900/95
    bgHeader: '#020617cc',      // slate-950/80
    bgCard: '#0f172a99',        // slate-900/60
    bgCardHover: '#1e293b99',   // slate-800/60
    bgCardSelected: '#2563eb1a', // blue-500/10

    // ── Borders ─────────────────────────────────
    borderBase: '#1e293bcc',     // slate-800/80
    borderSubtle: '#334155',    // slate-700
    borderFocus: '#3b82f6',     // blue-500

    // ── Typography ──────────────────────────────
    textPrimary: '#f8fafc',     // slate-50
    textSecondary: '#94a3b8',   // slate-400
    textMuted: '#64748b',       // slate-500
    textInverse: '#ffffff',

    // ── Accents & Actions ───────────────────────
    accent: '#2563eb',          // blue-600
    accentHover: '#3b82f6',     // blue-500
    accentGlow: 'rgba(37, 99, 235, 0.25)',
    accentSubtle: '#2563eb26',  // blue-600/15

    // ── Status Indicators ───────────────────────
    statusSuccess: '#34d399',       // emerald-400
    statusSuccessBg: '#10b98126',   // emerald-500/15
    statusSuccessBorder: '#10b98140', // emerald-500/25
    statusError: '#f87171',         // red-400
    statusErrorBg: '#ef444426',     // red-500/15
    statusErrorBorder: '#ef444440',
    statusWarning: '#fb923c',       // classy coral/orange (avoiding garish yellow)
    statusWarningBg: '#ea580c20',
    statusWarningBorder: '#ea580c35',

    // ── Tamper & Negative Testing ───────────────
    tamper: '#a78bfa',              // violet-400
    tamperBg: '#a78bfa18',
    tamperBorder: '#a78bfa35',

    // ── Environment Badges ──────────────────────
    badgeLocal: '#34d399',          // emerald-400
    badgeLocalBg: '#10b98126',
    badgeCollab: '#c084fc',         // purple-400
    badgeCollabBg: '#a855f726',
    badgeExternal: '#a5b4fc',       // indigo-300
    badgeExternalBg: '#6366f126',
    badgeMock: '#94a3b8',           // slate-400
    badgeMockBg: '#94a3b820',
  },
}
