/**
 * W3C Verifiable Credentials in JSON-LD form (`ldp_vc`), signed with
 * `Ed25519Signature2020`.
 *
 * Both data models are emitted from the same code path because the only real
 * differences are the base context and the validity property names — keeping
 * them together makes the 1.1-vs-2.0 interoperability comparison honest.
 *
 * The proof itself is produced by the Digital Bazaar reference suite rather than
 * hand-rolled. `Ed25519Signature2020` hashes the URDNA2015 canonical form of the
 * document and of the proof options separately, and a mistake anywhere in that
 * chain surfaces at the verifier as a bare "Verification Failed" with no
 * diagnostic detail, so a reference implementation is worth the dependency.
 */

import * as vc from '@digitalbazaar/vc'
import { Ed25519Signature2020 } from '@digitalbazaar/ed25519-signature-2020'
import { documentLoader } from '../jsonld'
import type { PlaygroundKey } from '../keys'

export type DataModel = '1.1' | '2.0'

const BASE_CONTEXT: Record<DataModel, string[]> = {
  // The ed25519-2020 suite context is separate in 1.1.
  '1.1': ['https://www.w3.org/2018/credentials/v1', 'https://w3id.org/security/suites/ed25519-2020/v1'],
  // The v2 context already defines Ed25519Signature2020; adding the suite
  // context again would redefine protected terms and abort canonicalisation.
  '2.0': ['https://www.w3.org/ns/credentials/v2'],
}

/**
 * Term definitions for the playground's own credential type, supplied inline
 * rather than as a hosted context URL.
 *
 * Neither base context defines our credential type or its subject properties,
 * and JSON-LD drops undefined terms — which silently changes what gets
 * canonicalised and therefore what gets signed. (`jsonld` safe mode turns that
 * silent drop into an error, which is how this was caught.)
 *
 * An inline context is deliberate: a hosted URL would make every verifier's
 * signature check depend on our host being reachable, and a context that 404s
 * at verification time is indistinguishable from a bad signature. Inlining keeps
 * the credential self-contained and resolvable offline by any implementation.
 */
const PLAYGROUND_VOCAB = 'https://inji-playground.mosip.dev/vocab#'
const inlineContext = () => ({ '@vocab': PLAYGROUND_VOCAB })

export interface IssueLdpOptions {
  key: PlaygroundKey
  dataModel: DataModel
  /** Credential `type` beyond `VerifiableCredential`, e.g. `PlaygroundIdentityCredential`. */
  credentialType: string
  subject: Record<string, unknown>
  /** Holder DID, bound as `credentialSubject.id` for holder-binding checks. */
  holderDid?: string
  validityDays?: number
  /** Backdate issuance and expiry — used by the negative-path suite. */
  expired?: boolean
  id?: string
}

/**
 * Builds an unsigned credential. Kept separate from signing so the tamper suite
 * can mutate a credential before or after the proof is attached.
 */
export function buildCredential(opts: IssueLdpOptions): Record<string, unknown> {
  const {
    key, dataModel, credentialType, subject, holderDid,
    validityDays = 365, expired = false,
  } = opts

  const now = new Date()
  const issued = expired ? new Date(now.getTime() - 400 * 86400_000) : new Date(now.getTime() - 5 * 60_000)
  const expires = expired
    ? new Date(now.getTime() - 35 * 86400_000)
    : new Date(now.getTime() + validityDays * 86400_000)

  const credentialSubject: Record<string, unknown> = { ...subject }
  if (holderDid && (holderDid.startsWith('did:') || holderDid.startsWith('urn:') || holderDid.startsWith('http:') || holderDid.startsWith('https:'))) {
    credentialSubject.id = holderDid
  }

  const credential: Record<string, unknown> = {
    '@context': [...BASE_CONTEXT[dataModel], inlineContext()],
    id: opts.id ?? `urn:uuid:${crypto.randomUUID()}`,
    type: ['VerifiableCredential', credentialType],
    issuer: key.did,
    credentialSubject,
  }

  if (dataModel === '1.1') {
    credential.issuanceDate = issued.toISOString().replace(/\.\d{3}Z$/, 'Z')
    credential.expirationDate = expires.toISOString().replace(/\.\d{3}Z$/, 'Z')
  } else {
    credential.validFrom = issued.toISOString().replace(/\.\d{3}Z$/, 'Z')
    credential.validUntil = expires.toISOString().replace(/\.\d{3}Z$/, 'Z')
  }

  return credential
}

function suiteFor(key: PlaygroundKey): Ed25519Signature2020 {
  if (!key.signatureKeyPair) {
    throw new Error('Ed25519Signature2020 requires an Ed25519 key; got ' + key.alg)
  }
  return new Ed25519Signature2020({ key: key.signatureKeyPair })
}

/** Signs an already-built credential, leaving its contents untouched. */
export async function signCredential(
  credential: Record<string, unknown>,
  key: PlaygroundKey,
): Promise<Record<string, unknown>> {
  return vc.issue({ credential, suite: suiteFor(key), documentLoader })
}

export async function issueLdpCredential(opts: IssueLdpOptions): Promise<Record<string, unknown>> {
  return signCredential(buildCredential(opts), opts.key)
}

/**
 * Wraps credentials in a `VerifiablePresentation` and signs it with the holder's
 * key, binding the verifier's `nonce` as the proof `challenge` and the client id
 * as the `domain`. Without that binding a presentation is replayable.
 */
export async function signPresentation(opts: {
  credentials: Record<string, unknown>[]
  holderKey: PlaygroundKey
  challenge: string
  domain?: string
}): Promise<Record<string, unknown>> {
  const presentation = vc.createPresentation({
    verifiableCredential: opts.credentials,
    holder: opts.holderKey.did,
  })

  return vc.signPresentation({
    presentation,
    suite: suiteFor(opts.holderKey),
    challenge: opts.challenge,
    domain: opts.domain,
    documentLoader,
  })
}

/**
 * Local verification, used as a pre-flight before a credential is sent to Inji
 * Verify. A failure here is a bug in our signing; a failure only at Inji Verify
 * is an interoperability finding.
 */
export async function verifyCredentialLocally(
  credential: Record<string, unknown>,
): Promise<{ verified: boolean; error?: string }> {
  try {
    const result = await vc.verifyCredential({
      credential,
      suite: new Ed25519Signature2020(),
      documentLoader,
    })
    return {
      verified: Boolean(result.verified),
      error: result.verified ? undefined : JSON.stringify(result.error ?? result, null, 2).slice(0, 4000),
    }
  } catch (err) {
    return { verified: false, error: String(err) }
  }
}
