/**
 * End-to-end check of the playground's own OpenID4VCI issuer.
 *
 * Walks the full draft-13 pre-authorized_code flow against a running BFF —
 * metadata discovery, offer, token, nonce, proof of possession, credential —
 * then submits the resulting credential to live Collab Inji Verify. The point is
 * that no step is simulated: if the issuer's proof validation is wrong, or the
 * credential it signs does not verify upstream, this fails.
 *
 * Also exercises the rejection paths, because an issuer that accepts a bad proof
 * is worse than one that issues nothing.
 *
 *   npm run server          # in another terminal
 *   npx tsx scripts/check-issuance.ts
 */

import * as jose from 'jose'
import { generateEd25519Key } from '../server/keys'

const BFF = process.env.BFF_URL || 'http://localhost:3001'
const ISSUER = `${BFF}/api/playground-issuer`
const VERIFY_URL = 'https://injiverify.collab.mosip.net/v1/verify/v2/vc-verification'

let failures = 0

function report(label: string, ok: boolean, detail?: string) {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function json(url: string, init?: RequestInit) {
  const res = await fetch(url, init)
  const text = await res.text()
  let body: unknown
  try { body = JSON.parse(text) } catch { body = text.slice(0, 800) }
  return { status: res.status, body: body as Record<string, unknown> }
}

const form = (fields: Record<string, string>) => ({
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams(fields).toString(),
})

const postJson = (body: unknown, token?: string) => ({
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
  body: JSON.stringify(body),
})

/** A proof-of-possession JWT, with knobs so the negative cases can bend it. */
async function makeProof(
  holder: Awaited<ReturnType<typeof generateEd25519Key>>,
  opts: { nonce?: string; audience?: string; typ?: string } = {},
) {
  return new jose.SignJWT({ nonce: opts.nonce })
    .setProtectedHeader({
      alg: 'EdDSA',
      typ: opts.typ ?? 'openid4vci-proof+jwt',
      kid: holder.verificationMethod,
    })
    .setAudience(opts.audience ?? ISSUER)
    .setIssuedAt()
    .sign(holder.privateKey)
}

async function main() {
  const health = await json(`${BFF}/api/health`).catch(() => null)
  if (!health || health.status !== 200) {
    console.error(`No BFF at ${BFF}. Start it with: npm run server`)
    process.exit(1)
  }

  const line = (s: string) => console.log(`\n${'─'.repeat(64)}\n${s}\n${'─'.repeat(64)}`)

  // ── Metadata ──────────────────────────────────────────────────────────────
  line('OpenID4VCI metadata discovery')
  const meta = await json(`${ISSUER}/.well-known/openid-credential-issuer`)
  report('issuer metadata served', meta.status === 200, `HTTP ${meta.status}`)
  report('credential_issuer matches the identifier', meta.body.credential_issuer === ISSUER, String(meta.body.credential_issuer))
  report('nonce_endpoint advertised', typeof meta.body.nonce_endpoint === 'string')

  const configs = Object.keys((meta.body.credential_configurations_supported ?? {}) as object)
  report('credential configurations advertised', configs.length > 0, configs.join(', '))

  const alias = await json(`${BFF}/.well-known/openid-credential-issuer/playground/issuer`)
  report('spec-literal well-known insertion also served', alias.status === 200, `HTTP ${alias.status}`)

  const asMeta = await json(`${ISSUER}/.well-known/oauth-authorization-server`)
  const grants = (asMeta.body.grant_types_supported ?? []) as string[]
  report('pre-authorized_code grant advertised',
    grants.includes('urn:ietf:params:oauth:grant-type:pre-authorized_code'), grants.join(', '))

  // ── Happy path, once per configuration ────────────────────────────────────
  const credentials: { config: string; credential: Record<string, unknown> }[] = []

  for (const configurationId of configs) {
    line(`Issuance — ${configurationId}`)

    const offer = await json(`${ISSUER}/offer`, postJson({ configurationId }))
    report('offer created', offer.status === 200, `HTTP ${offer.status}`)
    const grant = ((offer.body.credential_offer as Record<string, unknown>)?.grants as Record<string, Record<string, string>>)
      ?.['urn:ietf:params:oauth:grant-type:pre-authorized_code']
    const preAuthCode = grant?.['pre-authorized_code'] ?? ''
    report('offer carries a pre-authorized_code', Boolean(preAuthCode))
    report('offer URI is a credential-offer deep link',
      String(offer.body.credential_offer_uri).startsWith('openid-credential-offer://'))

    const token = await json(`${ISSUER}/token`, form({
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      'pre-authorized_code': preAuthCode,
    }))
    report('token issued', token.status === 200 && Boolean(token.body.access_token), `HTTP ${token.status}`)
    report('token response carries a c_nonce', typeof token.body.c_nonce === 'string')
    const accessToken = token.body.access_token as string

    const replay = await json(`${ISSUER}/token`, form({
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      'pre-authorized_code': preAuthCode,
    }))
    report('pre-authorized_code is single-use', replay.status === 400, `HTTP ${replay.status} ${String(replay.body.error ?? '')}`)

    const nonceRes = await json(`${ISSUER}/nonce`, postJson({}, accessToken))
    report('nonce endpoint returns a fresh c_nonce', nonceRes.status === 200 && typeof nonceRes.body.c_nonce === 'string')

    const holder = await generateEd25519Key()
    const proof = await makeProof(holder, { nonce: nonceRes.body.c_nonce as string })

    const credRes = await json(`${ISSUER}/credential`, postJson({
      credential_configuration_id: configurationId,
      proof: { proof_type: 'jwt', jwt: proof },
    }, accessToken))
    report('credential issued', credRes.status === 200 && Boolean(credRes.body.credential),
      `HTTP ${credRes.status} ${JSON.stringify(credRes.body).slice(0, 160)}`)

    if (credRes.status !== 200) continue
    const credential = credRes.body.credential as Record<string, unknown>
    const subject = credential.credentialSubject as Record<string, unknown>
    report('credential is bound to the holder DID', subject?.id === holder.did, String(subject?.id))
    credentials.push({ config: configurationId, credential })
  }

  // ── Rejection paths ───────────────────────────────────────────────────────
  line('Proof validation — these must all be rejected')

  const setup = async () => {
    const offer = await json(`${ISSUER}/offer`, postJson({ configurationId: configs[0] }))
    const code = ((offer.body.credential_offer as Record<string, unknown>).grants as Record<string, Record<string, string>>)
      ['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']
    const token = await json(`${ISSUER}/token`, form({
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      'pre-authorized_code': code,
    }))
    return { accessToken: token.body.access_token as string, cNonce: token.body.c_nonce as string }
  }

  const holder = await generateEd25519Key()

  {
    const { accessToken, cNonce } = await setup()
    const res = await json(`${ISSUER}/credential`, postJson({
      credential_configuration_id: configs[0],
      proof: { proof_type: 'jwt', jwt: await makeProof(holder, { nonce: cNonce, typ: 'JWT' }) },
    }, accessToken))
    report('wrong proof JWT typ rejected', res.status === 400 && res.body.error === 'invalid_proof',
      `HTTP ${res.status} ${String(res.body.error)}`)
    report('rejection carries a fresh c_nonce for retry', typeof res.body.c_nonce === 'string')
  }

  {
    const { accessToken, cNonce } = await setup()
    const res = await json(`${ISSUER}/credential`, postJson({
      credential_configuration_id: configs[0],
      proof: { proof_type: 'jwt', jwt: await makeProof(holder, { nonce: cNonce, audience: 'https://not-this-issuer.example' }) },
    }, accessToken))
    report('wrong audience rejected', res.status === 400 && res.body.error === 'invalid_proof', `HTTP ${res.status}`)
  }

  {
    const { accessToken } = await setup()
    const res = await json(`${ISSUER}/credential`, postJson({
      credential_configuration_id: configs[0],
      proof: { proof_type: 'jwt', jwt: await makeProof(holder, { nonce: 'not-a-real-nonce' }) },
    }, accessToken))
    report('unknown nonce rejected', res.status === 400 && res.body.error === 'invalid_proof', `HTTP ${res.status}`)
  }

  {
    // A nonce is single-use: spend it, then try again with the same one.
    const { accessToken, cNonce } = await setup()
    await json(`${ISSUER}/credential`, postJson({
      credential_configuration_id: configs[0],
      proof: { proof_type: 'jwt', jwt: await makeProof(holder, { nonce: cNonce }) },
    }, accessToken))
    const res = await json(`${ISSUER}/credential`, postJson({
      credential_configuration_id: configs[0],
      proof: { proof_type: 'jwt', jwt: await makeProof(holder, { nonce: cNonce }) },
    }, accessToken))
    report('replayed c_nonce rejected', res.status === 400 && res.body.error === 'invalid_proof', `HTTP ${res.status}`)
  }

  {
    const res = await json(`${ISSUER}/credential`, postJson({ configurationId: configs[0] }))
    report('missing access token rejected', res.status === 401, `HTTP ${res.status}`)
  }

  {
    const { accessToken, cNonce } = await setup()
    const res = await json(`${ISSUER}/credential`, postJson({
      credential_configuration_id: configs[0],
      format: 'mso_mdoc',
      proof: { proof_type: 'jwt', jwt: await makeProof(holder, { nonce: cNonce }) },
    }, accessToken))
    report('format mismatch against the configuration rejected',
      res.status === 400 && res.body.error === 'unsupported_credential_format', `HTTP ${res.status}`)
  }

  {
    const offer = await json(`${ISSUER}/offer`, postJson({ configurationId: configs[0], requireTxCode: true }))
    const code = ((offer.body.credential_offer as Record<string, unknown>).grants as Record<string, Record<string, string>>)
      ['urn:ietf:params:oauth:grant-type:pre-authorized_code']['pre-authorized_code']
    const bad = await json(`${ISSUER}/token`, form({
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      'pre-authorized_code': code, tx_code: '000000',
    }))
    report('wrong tx_code rejected', bad.status === 400, `HTTP ${bad.status}`)
    const good = await json(`${ISSUER}/token`, form({
      grant_type: 'urn:ietf:params:oauth:grant-type:pre-authorized_code',
      'pre-authorized_code': code, tx_code: '111111',
    }))
    report('correct tx_code accepted', good.status === 200, `HTTP ${good.status}`)
  }

  // ── The credentials we just issued, against real Inji Verify ──────────────
  line('Issued credentials → live Collab Inji Verify')
  for (const { config, credential } of credentials) {
    const res = await json(VERIFY_URL, postJson({
      verifiableCredential: JSON.stringify(credential),
      includeClaims: true,
      skipStatusChecks: true,
    }))
    report(`${config} verifies upstream`, res.body.allChecksSuccessful === true,
      `HTTP ${res.status} ${JSON.stringify(res.body.schemaAndSignatureCheck ?? res.body).slice(0, 200)}`)
  }

  console.log(`\n${'═'.repeat(64)}`)
  console.log(failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`)
  process.exit(failures === 0 ? 0 : 1)
}

main()
