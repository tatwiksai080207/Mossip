import mermaid from 'mermaid'

export function initMermaid(isExpanded: boolean = false) {
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    themeVariables: {
      darkMode: true,
      background: 'transparent',
      primaryColor: '#1e293b',
      primaryTextColor: '#f8fafc',
      primaryBorderColor: '#334155',
      lineColor: '#64748b',
      secondaryColor: '#0f172a',
      tertiaryColor: '#1e293b',
      noteBkgColor: '#1e293b',
      noteTextColor: '#cbd5e1',
      noteBorderColor: '#475569',
      actorBkg: '#0f172a',
      actorBorder: '#38bdf8',
      actorTextColor: '#f8fafc',
      actorLineColor: '#334155',
      signalColor: '#64748b',
      signalTextColor: '#94a3b8',
      labelBoxBkgColor: '#1e293b',
      labelBoxBorderColor: '#334155',
      labelTextColor: '#f8fafc',
      loopTextColor: '#cbd5e1',
      activationBorderColor: '#38bdf8',
      activationBkgColor: '#0369a1',
      sequenceNumberColor: '#38bdf8',
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
