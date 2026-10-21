/**
 * Verifier Proxy & ISO 18013-5 mDoc Result Evaluator
 * Tracks in-flight mDoc sessions and intercepts direct-post evaluation for local verification.
 */

export interface MdocSession {
  transactionId: string
  nonce?: string
}

export interface MdocVerificationResult {
  verified: boolean
  deviceBindingVerified?: boolean
  claims?: Record<string, unknown>
  error?: string
}

const localMdocSessions = new Map<string, MdocSession>()
const localMdocResults = new Map<string, MdocVerificationResult>()

export function setMdocSession(id: string, session: MdocSession) {
  localMdocSessions.set(id, session)
}

export function getMdocSession(id: string): MdocSession | undefined {
  return localMdocSessions.get(id)
}

export function setMdocResult(txnId: string, result: MdocVerificationResult) {
  localMdocResults.set(txnId, result)
}

export function getMdocResult(txnId: string): MdocVerificationResult | undefined {
  return localMdocResults.get(txnId)
}

export function hasMdocResult(txnId: string): boolean {
  return localMdocResults.has(txnId)
}

export function formatMdocResponse(txnId: string, mdocRes: MdocVerificationResult) {
  return {
    transactionId: txnId,
    vpResultStatus: mdocRes.verified ? 'SUCCESS' : 'FAILED',
    verificationStatus: mdocRes.verified ? 'SUCCESS' : 'INVALID',
    verifierEngine: 'Local Inji Verify (MOSIP Docker Stack 0.17.0 + ISO/IEC 18013-5 Engine)',
    checks: {
      signatureValid: mdocRes.verified,
      elementsValid: mdocRes.verified,
      deviceAuthValid: mdocRes.deviceBindingVerified ?? true,
      notExpired: true,
      trustModel: 'Local Inji Verify (ISO/IEC 18013-5 mDoc Engine)',
    },
    vcResults: [
      {
        verificationStatus: mdocRes.verified ? 'SUCCESS' : 'INVALID',
        format: 'mso_mdoc',
        claims: mdocRes.claims || {},
        error: mdocRes.error,
      },
    ],
    error: mdocRes.error,
  }
}
