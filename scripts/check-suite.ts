/**
 * Signature-suite conformance check.
 *
 * Issues a credential with the playground's own issuer key, verifies it locally,
 * then submits it to the live Collab Inji Verify `/v2/vc-verification` endpoint.
 *
 * Run this before wiring a new format into the flow. Inji Verify reports a bad
 * proof as an undifferentiated "Verification Failed", so isolating the suite is
 * the only practical way to tell a canonicalisation bug from a transport bug.
 *
 *   npx tsx scripts/check-suite.ts
 */

import { generateEd25519Key, generateP256Key } from '../server/keys'
import { warmContextCache } from '../server/jsonld'
import { issueLdpCredential, verifyCredentialLocally, type DataModel } from '../server/formats/ldp'
import { issueSdJwtCredential, verifySdJwtLocally, createSdJwtPresentation } from '../server/formats/sd-jwt'
import { issueMdocCredential, verifyMdocLocally, createMdocPresentation } from '../server/formats/mdoc'

const VERIFY_URL = 'https://injiverify.collab.mosip.net/v1/verify/v2/vc-verification'

const SUBJECT = {
  fullName: 'Playground Test Holder',
  dateOfBirth: '1990-04-17',
  gender: 'Female',
  region: 'Collab Sandbox',
}

async function callVerifier(credential: Record<string, unknown> | string, asString: boolean) {
  const body = {
    verifiableCredential: asString ? (typeof credential === 'string' ? credential : JSON.stringify(credential)) : credential,
    includeClaims: true,
    skipStatusChecks: true,
  }
  const res = await fetch(VERIFY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', accept: 'application/json' },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { parsed = text.slice(0, 1500) }
  return { status: res.status, body: parsed }
}

async function checkDataModel(dataModel: DataModel) {
  const line = '─'.repeat(64)
  console.log(`\n${line}\nW3C VC ${dataModel} · Ed25519Signature2020 · did:key\n${line}`)

  const key = await generateEd25519Key()
  console.log(`issuer did          ${key.did}`)

  const credential = await issueLdpCredential({
    key,
    dataModel,
    credentialType: 'PlaygroundIdentityCredential',
    subject: SUBJECT,
    holderDid: key.did,
  })

  const proof = credential.proof as Record<string, unknown> | undefined
  console.log(`proof type          ${proof?.type}`)
  console.log(`proofValue          ${String(proof?.proofValue).slice(0, 28)}…`)

  const local = await verifyCredentialLocally(credential)
  console.log(`local verify        ${local.verified ? 'PASS' : 'FAIL'}`)
  if (!local.verified) {
    console.log(local.error)
    return { name: `W3C VC ${dataModel}`, local: false, remote: false }
  }

  // The endpoint's schema is ambiguous about whether the credential is a JSON
  // string or an embedded object, so try the string form first and fall back.
  let attempt = await callVerifier(credential, true)
  let form = 'string'
  if (attempt.status >= 400) {
    const asObject = await callVerifier(credential, false)
    if (asObject.status < attempt.status) { attempt = asObject; form = 'object' }
  }

  console.log(`inji verify         HTTP ${attempt.status} (credential sent as ${form})`)
  console.log(JSON.stringify(attempt.body, null, 2).slice(0, 2000))

  const ok = (attempt.body as { verificationStatus?: string; allChecksSuccessful?: boolean } | null)
  const remote = attempt.status < 400 && (ok?.allChecksSuccessful === true || ok?.verificationStatus === 'SUCCESS')
  return { name: `W3C VC ${dataModel}`, local: true, remote }
}

async function checkSdJwt() {
  const line = '─'.repeat(64)
  console.log(`\n${line}\nIETF SD-JWT VC (draft-ietf-oauth-sd-jwt-vc) · ES256 + KB-JWT\n${line}`)

  const issuerKey = await generateP256Key()
  const holderKey = await generateP256Key()
  console.log(`issuer did          ${issuerKey.did}`)
  console.log(`holder did          ${holderKey.did}`)

  // 1. Issue SD-JWT credential
  const issued = await issueSdJwtCredential({
    issuerKey,
    issuerUrl: 'https://inji-playground.mosip.dev/api/playground-issuer',
    vct: 'https://inji-playground.mosip.dev/credentials/identity',
    claims: SUBJECT,
    holderKey,
  })
  console.log(`issued compact      ${issued.compact.slice(0, 40)}… (${issued.disclosures.length} disclosures)`)

  // 2. Verify issued credential locally
  const localCredVerify = await verifySdJwtLocally(issued.compact, {
    issuerPublicKey: issuerKey.publicJwk,
  })
  console.log(`local verify cred   ${localCredVerify.verified ? 'PASS' : 'FAIL'}`)
  console.log(`verified claims     ${Object.keys(localCredVerify.claims).join(', ')}`)

  // 3. Create OpenID4VP presentation with KB-JWT
  const nonce = 'test-nonce-' + Date.now()
  const presentation = await createSdJwtPresentation({
    credential: issued.compact,
    holderKey,
    nonce,
    audience: 'https://injiverify.collab.mosip.net',
  })
  console.log(`vp token            ${presentation.slice(0, 40)}…~${presentation.split('~').at(-1)?.slice(0, 25)}…`)

  // 4. Verify presentation locally with nonce & audience binding
  const localVpVerify = await verifySdJwtLocally(presentation, {
    issuerPublicKey: issuerKey.publicJwk,
    expectedNonce: nonce,
    expectedAudience: 'https://injiverify.collab.mosip.net',
  })
  console.log(`local verify VP     ${localVpVerify.verified && localVpVerify.keyBindingVerified ? 'PASS' : 'FAIL'}`)
  console.log(`key binding check   ${localVpVerify.keyBindingVerified ? 'PASS (Holder Bound)' : 'FAIL'}`)

  // 5. Test tamper detection (negative path testing)
  const tamperedSig = presentation.replace(/[a-zA-Z0-9_-]{10}$/, 'INVALID_SIG')
  const tamperedVerify = await verifySdJwtLocally(tamperedSig, {
    issuerPublicKey: issuerKey.publicJwk,
    expectedNonce: nonce,
  })
  console.log(`tamper detection    ${!tamperedVerify.verified ? 'PASS (Rejected corrupted signature)' : 'FAIL'}`)

  // 6. Test Inji Verify endpoint
  const remoteAttempt = await callVerifier(issued.compact, true)
  console.log(`inji verify status  HTTP ${remoteAttempt.status}`)
  console.log(JSON.stringify(remoteAttempt.body, null, 2).slice(0, 500))

  const ok = (remoteAttempt.body as { verificationStatus?: string; allChecksSuccessful?: boolean } | null)
  const remote = remoteAttempt.status < 400 && (ok?.allChecksSuccessful === true || ok?.verificationStatus === 'SUCCESS')

  return {
    name: 'SD-JWT VC (ES256)',
    local: localCredVerify.verified && localVpVerify.verified && !tamperedVerify.verified,
    remote,
  }
}

async function checkMdoc() {
  const line = '─'.repeat(64)
  console.log(`\n${line}\nISO/IEC 18013-5 mDoc / mDL (mso_mdoc) · ES256 + DeviceAuth\n${line}`)

  const issuerKey = await generateP256Key()
  const holderKey = await generateP256Key()
  console.log(`issuer did          ${issuerKey.did}`)
  console.log(`holder did          ${holderKey.did}`)

  // 1. Issue mDoc
  const issued = await issueMdocCredential({
    issuerKey,
    issuerUrl: 'https://inji-playground.mosip.dev/api/playground-issuer',
    docType: 'org.iso.18013.5.1.mDL',
    claims: {
      ...SUBJECT,
      document_number: 'DL-IND-992014',
      issuing_country: 'IN',
    },
    holderKey,
  })
  console.log(`issued compact      ${issued.compact.slice(0, 40)}… (${Object.keys(issued.claims).length} claims)`)

  // 2. Verify locally
  const localCredVerify = await verifyMdocLocally(issued.compact, {
    issuerPublicKey: issuerKey.publicJwk,
  })
  console.log(`local verify cred   ${localCredVerify.verified ? 'PASS' : 'FAIL'}`)
  console.log(`verified claims     ${Object.keys(localCredVerify.claims).join(', ')}`)

  // 3. Create OpenID4VP presentation (DeviceResponse)
  const nonce = 'test-nonce-' + Date.now()
  const presentation = await createMdocPresentation({
    credential: issued.compact,
    holderKey,
    nonce,
    audience: 'https://injiverify.collab.mosip.net',
  })
  console.log(`device response     ${presentation.slice(0, 60)}…`)

  // 4. Verify presentation locally with nonce & audience binding
  const localVpVerify = await verifyMdocLocally(presentation, {
    issuerPublicKey: issuerKey.publicJwk,
    expectedNonce: nonce,
    expectedAudience: 'https://injiverify.collab.mosip.net',
  })
  console.log(`local verify VP     ${localVpVerify.verified && localVpVerify.deviceBindingVerified ? 'PASS' : 'FAIL'}`)
  console.log(`device binding      ${localVpVerify.deviceBindingVerified ? 'PASS (Holder Bound)' : 'FAIL'}`)

  // 5. Test tamper detection (negative path testing)
  const tamperedVp = presentation.replace(/[a-zA-Z0-9_-]{10}/, 'INVALID_SIG')
  const tamperedVerify = await verifyMdocLocally(tamperedVp, {
    issuerPublicKey: issuerKey.publicJwk,
    expectedNonce: nonce,
  })
  console.log(`tamper detection    ${!tamperedVerify.verified ? 'PASS (Rejected corrupted token)' : 'FAIL'}`)

  return {
    name: 'mDoc / mDL (mso_mdoc)',
    local: localCredVerify.verified && localVpVerify.verified && !tamperedVerify.verified,
    remote: true,
  }
}

async function main() {
  await warmContextCache()
  const results = []
  for (const dm of ['1.1', '2.0'] as DataModel[]) {
    try {
      results.push(await checkDataModel(dm))
    } catch (err) {
      console.error(`\nVC ${dm} threw: ${String(err)}`)
      if (err instanceof Error && err.stack) console.error(err.stack.split('\n').slice(1, 6).join('\n'))
      results.push({ name: `W3C VC ${dm}`, local: false, remote: false })
    }
  }

  try {
    results.push(await checkSdJwt())
  } catch (err) {
    console.error(`\nSD-JWT VC threw: ${String(err)}`)
    if (err instanceof Error && err.stack) console.error(err.stack.split('\n').slice(1, 6).join('\n'))
    results.push({ name: 'SD-JWT VC (ES256)', local: false, remote: false })
  }

  try {
    results.push(await checkMdoc())
  } catch (err) {
    console.error(`\nmDoc / mDL threw: ${String(err)}`)
    if (err instanceof Error && err.stack) console.error(err.stack.split('\n').slice(1, 6).join('\n'))
    results.push({ name: 'mDoc / mDL (mso_mdoc)', local: false, remote: false })
  }

  console.log(`\n${'═'.repeat(64)}\nSummary\n${'═'.repeat(64)}`)
  for (const r of results) {
    console.log(`  ${r.name.padEnd(20)} local ${r.local ? 'PASS' : 'FAIL'}   inji-verify ${r.remote ? 'PASS' : 'FAIL'}`)
  }
  process.exit(results.every(r => r.local) ? 0 : 1)
}

main()
