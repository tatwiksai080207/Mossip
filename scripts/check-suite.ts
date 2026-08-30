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

import { generateEd25519Key } from '../server/keys'
import { warmContextCache } from '../server/jsonld'
import { issueLdpCredential, verifyCredentialLocally, type DataModel } from '../server/formats/ldp'

const VERIFY_URL = 'https://injiverify.collab.mosip.net/v1/verify/v2/vc-verification'

const SUBJECT = {
  fullName: 'Playground Test Holder',
  dateOfBirth: '1990-04-17',
  gender: 'Female',
  region: 'Collab Sandbox',
}

async function callVerifier(credential: Record<string, unknown>, asString: boolean) {
  const body = {
    verifiableCredential: asString ? JSON.stringify(credential) : credential,
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
    return { dataModel, local: false, remote: false }
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
  return { dataModel, local: true, remote }
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
      results.push({ dataModel: dm, local: false, remote: false })
    }
  }

  console.log(`\n${'═'.repeat(64)}\nSummary\n${'═'.repeat(64)}`)
  for (const r of results) {
    console.log(`  VC ${r.dataModel.padEnd(4)} local ${r.local ? 'PASS' : 'FAIL'}   inji-verify ${r.remote ? 'PASS' : 'FAIL'}`)
  }
  process.exit(results.every(r => r.local) ? 0 : 1)
}

main()
