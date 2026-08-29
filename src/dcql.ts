import type { CredentialType } from './types'

// DCQL — the Digital Credentials Query Language from OpenID4VP draft 23+.
// The deployed Collab Inji Verify (v2 API) takes a dcqlQuery and no longer
// accepts the presentation_definition shape the older cloned repo used.

export interface DcqlClaimQuery {
  id?: string
  path: (string | number)[]
  values?: unknown[]
}

export interface DcqlCredentialQuery {
  id: string
  format: string
  meta: {
    // ldp_vc / jwt_vc pick their credential by VC `type`; SD-JWT VC by `vct`.
    type_values?: string[][]
    vct_values?: string[]
  }
  claims?: DcqlClaimQuery[]
  require_cryptographic_holder_binding?: boolean
  multiple?: boolean
}

export interface DcqlQuery {
  credentials: DcqlCredentialQuery[]
  credential_sets?: { options: string[][]; required?: boolean }[]
}

/**
 * A nonce for /v2/vp-request must be URL-safe and at least 16 characters —
 * the service rejects anything shorter with `invalid_request`.
 */
export function generateNonce(bytes = 24): string {
  const buf = new Uint8Array(bytes)
  crypto.getRandomValues(buf)
  let out = ''
  for (const b of buf) out += b.toString(16).padStart(2, '0')
  return out
}

/** Query id must be stable per credential so descriptor maps line up. */
export function queryIdFor(credType: CredentialType): string {
  return credType.id.replace(/[^A-Za-z0-9_-]/g, '_')
}

export function buildDcqlQuery(
  credType: CredentialType,
  opts: { claims?: DcqlClaimQuery[]; requireHolderBinding?: boolean } = {},
): DcqlQuery {
  const query: DcqlCredentialQuery = {
    id: queryIdFor(credType),
    format: credType.format,
    meta: credType.format === 'vc+sd-jwt'
      ? { vct_values: [credType.vct || credType.credentialTypeName || credType.id] }
      : { type_values: [credType.vcTypes || ['VerifiableCredential', credType.credentialTypeName || credType.id]] },
  }

  if (opts.claims?.length) query.claims = opts.claims
  if (opts.requireHolderBinding !== undefined) {
    query.require_cryptographic_holder_binding = opts.requireHolderBinding
  }

  return { credentials: [query] }
}
