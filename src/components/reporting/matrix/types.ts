export const FORMAT_LABELS: Record<string, string> = {
  ldp_vc: 'W3C VC (JSON-LD)',
  'vc+sd-jwt': 'SD-JWT VC',
  mso_mdoc: 'ISO 18013-5 mDoc',
}

export const ENV_BADGES: Record<string, { label: string; class: string }> = {
  local: { label: 'LOCAL', class: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
  collab: { label: 'COLLAB', class: 'bg-purple-500/15 text-purple-300 border-purple-500/30' },
  mock: { label: 'MOCK', class: 'bg-app-card text-app-text-muted border-app-border' },
  external: { label: 'EXTERNAL', class: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
}
