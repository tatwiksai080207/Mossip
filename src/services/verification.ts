import type { VerifierConfig } from '../types'
import { safeFetch, readBody, postJson, StepError, type StepResult, getVpSession } from './http-client'

export async function verifyPresentation(
  verifier: VerifierConfig
): Promise<StepResult> {
  const session = getVpSession()
  if (!session) {
    throw new StepError('No VP session to fetch a result for', {})
  }

  const host = verifier.host || '/api/verifier'
  let res, data
  if (verifier.env === 'local' || verifier.env === 'external') {
    const getRes = await safeFetch(`${host}/v1/verify/vp-result/${session.transactionId}`)
    res = getRes
    data = await readBody(getRes)
  } else {
    const postRes = await postJson(
      `${host}/v1/verify/v2/vp-results/${session.transactionId}`,
      { includeClaims: true },
    )
    res = postRes.res
    data = postRes.data
  }

  const verifierTitle = verifier.name || 'Verifier'

  if (!res.ok) {
    throw new StepError(`No verification result for ${session.transactionId} (HTTP ${res.status})`, {
      _transaction_id: session.transactionId,
      _http_status: res.status,
      _response: data,
      _reason: `${verifierTitle} only produces a result once a vp_token has been submitted to direct_post.`,
    })
  }

  const resultObj = data as Record<string, any> | null
  const vpStatus = (resultObj?.vpResultStatus || resultObj?.verificationStatus) as string | undefined
  const vcResults = resultObj?.vcResults as Array<{ verificationStatus?: string; vc?: string }> | undefined
  const credResults = resultObj?.credentialResults as Array<{ allChecksSuccessful?: boolean; schemaAndSignatureCheck?: { valid?: boolean } }> | undefined

  const isRejected =
    vpStatus === 'FAILED' ||
    vpStatus === 'INVALID' ||
    resultObj?.allChecksSuccessful === false ||
    vcResults?.some(v => v.verificationStatus === 'INVALID') ||
    credResults?.some(c => c.allChecksSuccessful === false || c.schemaAndSignatureCheck?.valid === false)

  if (isRejected) {
    const isMdoc = session?.dcqlQuery?.credentials?.[0]?.format === 'mso_mdoc' || JSON.stringify(data).includes('mso_mdoc')
    const isInji = verifier.env === 'local' || verifier.env === 'collab' || verifier.id.includes('inji')
    const isSdJwt = session?.dcqlQuery?.credentials?.[0]?.format === 'vc+sd-jwt' || JSON.stringify(data).includes('vc+sd-jwt')

    let findingMsg: string | undefined
    if (isMdoc && isInji) {
      findingMsg = 'Upstream Specification Gap (Finding #7): Inji Verify (verify-service 0.17.0) backend has no native ISO/IEC 18013-5 mDoc parser in VerifiablePresentationSubmissionServiceImpl.java (throws InvalidVpTokenException). Native mDoc verification is scheduled for Inji Verify v0.18.0+ (per docs.inji.io). To execute genuine end-to-end OpenID4VP verification of this mDoc credential, select "walt.id Verifier".'
    } else if (isSdJwt && isInji) {
      findingMsg = 'Inji Verify currently requires an X.509 certificate chain (x5c) for SD-JWT VC rather than decentralized did:key/did:jwk.'
    }

    throw new StepError(`${verifierTitle} rejected the presentation (status: ${vpStatus || 'FAILED'})`, {
      _vp_result_status: vpStatus,
      _verification_results: vcResults || credResults,
      _response: data,
      ...(findingMsg ? { _interop_finding: findingMsg } : {}),
      _upstream_status: (isMdoc && isInji) ? 'Planned v0.18.0+ (ISO/IEC 18013-5)' : undefined,
      _cross_ecosystem_alternative: (isMdoc && isInji) ? 'walt.id Verifier' : undefined,
    })
  }

  return { payload: data, source: 'live' }
}

/**
 * Direct VC verification against Inji Verify's /v2/vc-verification.
 * Independent of the VP session, so it works for any credential we can obtain
 * and is the quickest way to check a new signature suite in isolation.
 */
export async function verifyCredential(
  verifiableCredential: string,
  opts: { includeClaims?: boolean; skipStatusChecks?: boolean } = {},
): Promise<StepResult> {
  const { res, data } = await postJson('/api/verifier/v1/verify/v2/vc-verification', {
    verifiableCredential,
    includeClaims: opts.includeClaims ?? true,
    skipStatusChecks: opts.skipStatusChecks ?? false,
  })

  if (!res.ok) {
    throw new StepError(`VC verification call failed (HTTP ${res.status})`, {
      _http_status: res.status,
      _response: data,
    })
  }
  return { payload: data, source: 'live' }
}
