import type { FlowStep, FlowStepInfo, StepStatus, NetworkEvent } from '../../types'

export function sanitizeName(name: string): string {
  return name.replace(/[^\w\s-]/g, '').trim() || 'Entity'
}

export function mapTextToStep(text: string): FlowStep | null {
  const lower = text.toLowerCase()
  if (lower.includes('metadata')) return 'issuer-metadata'
  if (lower.includes('offer')) return 'credential-offer'
  if (lower.includes('token request')) return 'token-exchange'
  if (lower.includes('issue credential') || lower.includes('stored')) return 'credential-issuance'
  if (lower.includes('authorization request') || lower.includes('vp authorization')) return 'vp-request'
  if (lower.includes('vp token') || lower.includes('direct post') || lower.includes('tampered payload')) return 'vp-response'
  if (lower.includes('verif') || lower.includes('cryptographic') || lower.includes('integrity check') || lower.includes('status:')) return 'verification'
  return null
}

export function generateFullFlowDSL(params: {
  issuerName: string
  walletName: string
  verifierName: string
  credFormat: string
  steps: FlowStepInfo[]
  tamperMode: string
  networkEvents: NetworkEvent[]
}): string {
  const { issuerName, walletName, verifierName, credFormat, steps, tamperMode, networkEvents } = params

  const getStep = (id: FlowStep) => steps.find(s => s.id === id)
  const getStepStatus = (id: FlowStep) => getStep(id)?.status || 'pending'
  const getIcon = (st: StepStatus, id?: FlowStep) => {
    if (id) {
      const step = getStep(id)
      if (step && (step.payload as any)?._cancelled) return ' [Aborted]'
    }
    if (st === 'done') return ' [Done]'
    if (st === 'running') return ' [Active]'
    if (st === 'error') return ' [Failed]'
    return ''
  }

  const s1 = getStepStatus('issuer-metadata')
  const s2 = getStepStatus('credential-offer')
  const s3 = getStepStatus('token-exchange')
  const s4 = getStepStatus('credential-issuance')
  const s5 = getStepStatus('vp-request')
  const s6 = getStepStatus('vp-response')
  const s7 = getStepStatus('verification')

  const cleanIssuer = sanitizeName(issuerName)
  const cleanWallet = sanitizeName(walletName)
  const cleanVerifier = sanitizeName(verifierName)

  let dsl = `sequenceDiagram
  autonumber
  participant I as ${cleanIssuer}
  participant W as ${cleanWallet}
  participant V as ${cleanVerifier}

  rect rgb(15, 23, 42)
  Note over I,W: Phase 1: OpenID4VCI (Credential Issuance)
  W->>I: 1. Fetch Metadata (.well-known)${getIcon(s1, 'issuer-metadata')}
  I-->>W: 2. Credential Offer (${credFormat})${getIcon(s2, 'credential-offer')}
  W->>I: 3. Token Request (OAuth / DPoP)${getIcon(s3, 'token-exchange')}
  I-->>W: 4. Issue Credential Payload${getIcon(s4, 'credential-issuance')}
  end
`
  if (s4 === 'done') {
    dsl += `  Note over W: Credential Securely In Wallet (${credFormat})\n`
  }

  dsl += `
  rect rgb(15, 23, 42)
  Note over W,V: Phase 2: OpenID4VP (Presentation & Verification)
  V->>W: 5. VP Authorization Request (DCQL)${getIcon(s5, 'vp-request')}
`
  if (tamperMode !== 'none') {
    dsl += `  Note over W,V: [Negative Test] ${tamperMode === 'signature' ? 'Mutated Signature' : 'Corrupted Token'}\n`
    if (s6 === 'done' || s6 === 'running') {
      dsl += `  W-->>V: 6. Send Tampered VP Token${getIcon(s6, 'vp-response')}\n`
    } else {
      dsl += `  W-->>V: 6. VP Token Response${getIcon(s6, 'vp-response')}\n`
    }
    if (s7 === 'done') {
      dsl += `  V->>V: 7. Presentation Rejected (Test Passed)\n`
    } else if (s7 === 'error') {
      dsl += `  V-xV: 7. Verification Failed (Negative Assertion Met)\n`
    } else {
      dsl += `  V->>V: 7. Cryptographic Verification & Tamper Check${getIcon(s7, 'verification')}\n`
    }
  } else {
    dsl += `  W-->>V: 6. VP Token Response (Holder Binding)${getIcon(s6, 'vp-response')}\n`
    if (s7 === 'done') {
      dsl += `  V->>V: 7. Verification Success (Signature & Claims Valid)\n`
    } else if (s7 === 'error') {
      dsl += `  V-xV: 7. Verification Failed\n`
    } else {
      dsl += `  V->>V: 7. Verify Signature & Status List${getIcon(s7, 'verification')}\n`
    }
  }
  dsl += `  end\n`

  if (networkEvents && networkEvents.length > 0) {
    dsl += `\n  rect rgb(30, 41, 59)\n  Note over I,V: Live Network Trace\n`
    networkEvents.forEach(evt => {
      let from = 'I'
      let to = 'V'
      if (evt.url.includes('verify')) { from = 'W'; to = 'V' }
      else if (evt.url.includes('wallet')) { from = 'V'; to = 'W' }
      else { from = 'W'; to = 'I' }
      
      const cleanPath = evt.path || new URL(evt.url).pathname
      dsl += `  ${from}->>${to}: ${evt.method} ${cleanPath} [${evt.status}] [${evt.latencyMs}ms, ${evt.payloadSize}]\n`
    })
    dsl += `  end\n`
  }

  return dsl
}

export function generateVpFocusedDSL(params: {
  walletName: string
  verifierName: string
  credFormat: string
  steps: FlowStepInfo[]
  tamperMode: string
}): string {
  const { walletName, verifierName, credFormat, steps, tamperMode } = params
  const s5 = steps.find(s => s.id === 'vp-request')?.status || 'pending'
  const s6 = steps.find(s => s.id === 'vp-response')?.status || 'pending'
  const s7 = steps.find(s => s.id === 'verification')?.status || 'pending'

  const cleanWallet = sanitizeName(walletName)
  const cleanVerifier = sanitizeName(verifierName)

  const getStep = (id: FlowStep) => steps.find(s => s.id === id)
  const getIcon = (st: StepStatus, id?: FlowStep) => {
    if (id) {
      const step = getStep(id)
      if (step && (step.payload as any)?._cancelled) return ' [Aborted]'
    }
    if (st === 'done') return ' [Done]'
    if (st === 'running') return ' [Active]'
    if (st === 'error') return ' [Failed]'
    return ''
  }

  let dsl = `sequenceDiagram
  autonumber
  participant V as ${cleanVerifier}
  participant W as ${cleanWallet}
  participant C as Crypto & VP Engine

  rect rgb(15, 23, 42)
  Note over V,C: OpenID4VP Protocol Exchange (Task #3)
  V->>W: 1. Authorization Request (request_uri & DCQL)${getIcon(s5, 'vp-request')}
  Note over W: Parse DCQL query & match format (${credFormat})
  
  W->>C: 2. Request Selective Disclosures & Nonce Binding
  C-->>W: 3. Return Signed VP Token & Disclosures (${credFormat})
`
  if (tamperMode !== 'none') {
    dsl += `  Note over W,C: [Negative Test] Corrupted ${tamperMode}
  W->>V: 4. Direct Post VP Token (Tampered Payload)${getIcon(s6, 'vp-response')}
  V->>C: 5. Verify Cryptographic Integrity
  C-->>V: 6. Integrity Check: INVALID (Tamper Detected)${getIcon(s7, 'verification')}
`
  } else {
    dsl += `  W->>V: 4. Direct Post VP Token Response${getIcon(s6, 'vp-response')}
  V->>C: 5. Verify Cryptographic Signature & Issuer Trust
  C-->>V: 6. Status: Presentation Valid & Revocation Checked${getIcon(s7, 'verification')}
`
  }
  dsl += `  end\n`

  return dsl
}
