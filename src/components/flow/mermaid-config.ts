import mermaid from 'mermaid'

export function initMermaid(isExpanded: boolean = false) {
  let bgBase = '#09090b'
  let bgCard = '#18181b'
  let borderBase = '#27272a'
  let textPrimary = '#fafafa'
  let textMuted = '#71717a'
  let accent = '#6366f1'

  if (typeof window !== 'undefined') {
    const style = getComputedStyle(document.documentElement)
    bgBase = style.getPropertyValue('--app-bg-base').trim() || bgBase
    bgCard = style.getPropertyValue('--app-bg-card').trim() || bgCard
    borderBase = style.getPropertyValue('--app-border-base').trim() || borderBase
    textPrimary = style.getPropertyValue('--app-text-primary').trim() || textPrimary
    textMuted = style.getPropertyValue('--app-text-muted').trim() || textMuted
    accent = style.getPropertyValue('--app-accent').trim() || accent
  }

  // Strip 8-character hex codes down to 6-char hex for Mermaid compatibility
  const cleanHex = (val: string) => {
    if (val.startsWith('#') && val.length === 9) {
      return val.slice(0, 7)
    }
    return val
  }

  const cleanBgCard = cleanHex(bgCard)
  const cleanBgBase = cleanHex(bgBase)
  const cleanBorder = cleanHex(borderBase)
  const cleanAccent = cleanHex(accent)

  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
      darkMode: true,
      background: 'transparent',
      primaryColor: cleanBgCard,
      primaryTextColor: textPrimary,
      primaryBorderColor: cleanBorder,
      lineColor: textMuted,
      secondaryColor: cleanBgBase,
      tertiaryColor: cleanBgCard,
      noteBkgColor: cleanBgCard,
      noteTextColor: textPrimary,
      noteBorderColor: cleanBorder,
      actorBkg: cleanBgCard,
      actorBorder: cleanAccent,
      actorTextColor: textPrimary,
      actorLineColor: cleanBorder,
      signalColor: cleanAccent,
      signalTextColor: textPrimary,
      labelBoxBkgColor: cleanBgCard,
      labelBoxBorderColor: cleanBorder,
      labelTextColor: textPrimary,
      loopTextColor: textPrimary,
      activationBorderColor: cleanAccent,
      activationBkgColor: cleanBgCard,
      sequenceNumberColor: cleanAccent,
    },
    sequence: {
      showSequenceNumbers: true,
      actorMargin: isExpanded ? 150 : 100,
      messageMargin: 38,
      boxMargin: 10,
      boxTextMargin: 6,
      noteMargin: 12,
      useMaxWidth: false,
    },
    securityLevel: 'loose',
  })
}
