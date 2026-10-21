/**
 * JSON-LD document loader used for URDNA2015 canonicalisation when signing
 * Data Integrity proofs.
 *
 * Contexts are fetched once and cached for the process lifetime. Getting this
 * wrong is the usual cause of a signature that looks well-formed but fails
 * verification: if the issuer and the verifier canonicalise against different
 * context documents they derive different digests.
 */

import { base58Decode } from './keys'

const cache = new Map<string, unknown>()

// Pre-seeded so a signing run never depends on a network round trip for the
// contexts that every credential we issue references.
const WELL_KNOWN = [
  'https://www.w3.org/2018/credentials/v1',
  'https://www.w3.org/ns/credentials/v2',
  'https://w3id.org/security/suites/ed25519-2020/v1',
  'https://inji.github.io/inji-config/contexts/mosip-identity-context.json',
  'https://inji.github.io/inji-config/contexts/farmer.json',
]

async function fetchContext(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: 'application/ld+json, application/json' },
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`Context fetch failed for ${url}: HTTP ${res.status}`)
  return res.json()
}

export async function warmContextCache(): Promise<void> {
  await Promise.all(WELL_KNOWN.map(async (url) => {
    try {
      if (!cache.has(url)) cache.set(url, await fetchContext(url))
    } catch (err) {
      console.warn(`[jsonld] could not preload ${url}: ${String(err)}`)
    }
  }))
}

export interface RemoteDocument {
  contextUrl: null
  documentUrl: string
  document: unknown
}

// ── did:key resolution ──────────────────────────────────────────────────────
// Resolved locally, because that is the point of did:key: the public key is
// encoded in the identifier, so no network fetch and no hosting is required.
// This is why the playground signs with did:key rather than did:web — a live
// probe showed Inji Verify rejecting did:web with PublicKeyResolutionFailedException
// while resolving did:key fine.

const ED25519_2020_CTX = 'https://w3id.org/security/suites/ed25519-2020/v1'
const JWS_2020_CTX = 'https://w3id.org/security/suites/jws-2020/v1'

function verificationMethodFromDidKey(did: string): Record<string, unknown> {
  const multibase = did.slice('did:key:'.length)
  if (!multibase.startsWith('z')) throw new Error(`Unsupported did:key encoding: ${did}`)

  const bytes = base58Decode(multibase.slice(1))
  const id = `${did}#${multibase}`

  // Ed25519, multicodec 0xed 0x01.
  if (bytes[0] === 0xed && bytes[1] === 0x01) {
    return {
      '@context': ED25519_2020_CTX,
      id,
      type: 'Ed25519VerificationKey2020',
      controller: did,
      publicKeyMultibase: multibase,
    }
  }

  // P-256, multicodec 0x80 0x24, compressed SEC1 point.
  if (bytes[0] === 0x80 && bytes[1] === 0x24) {
    const compressed = bytes.subarray(2)
    return {
      '@context': JWS_2020_CTX,
      id,
      type: 'JsonWebKey2020',
      controller: did,
      publicKeyJwk: {
        kty: 'EC',
        crv: 'P-256',
        // Only x is recoverable without point decompression; consumers that need
        // y should use the multibase form. Sufficient for identification here.
        x: Buffer.from(compressed.subarray(1, 33)).toString('base64url'),
      },
    }
  }

  throw new Error(`Unsupported did:key multicodec 0x${bytes[0].toString(16)}${bytes[1].toString(16)}`)
}

function resolveDidKey(url: string): RemoteDocument {
  const [did] = url.split('#')
  const vm = verificationMethodFromDidKey(did)

  // A fragment asks for the verification method itself; the bare DID asks for
  // the DID document. Data Integrity suites request the former.
  if (url.includes('#')) {
    return { contextUrl: null, documentUrl: url, document: vm }
  }

  const vmNoCtx = { ...vm }
  delete vmNoCtx['@context']
  return {
    contextUrl: null,
    documentUrl: url,
    document: {
      '@context': ['https://www.w3.org/ns/did/v1', vm['@context']],
      id: did,
      verificationMethod: [vmNoCtx],
      authentication: [vm.id],
      assertionMethod: [vm.id],
    },
  }
}

async function resolveDidWeb(url: string): Promise<RemoteDocument> {
  const [did, fragment] = url.split('#')
  const parts = did.slice('did:web:'.length).split(':')
  const host = decodeURIComponent(parts[0])
  const path = parts.slice(1).map(decodeURIComponent).join('/')
  const httpsUrl = path.length > 0
    ? `https://${host}/${path}/did.json`
    : `https://${host}/.well-known/did.json`

  let didDoc: any = cache.get(did)
  if (!didDoc) {
    const res = await fetch(httpsUrl, {
      headers: { accept: 'application/ld+json, application/json' },
    })
    if (!res.ok) throw new Error(`did:web fetch failed for ${httpsUrl}: HTTP ${res.status}`)
    didDoc = await res.json()
    cache.set(did, didDoc)
  }

  if (fragment) {
    const fullId = `${did}#${fragment}`
    const vms = (didDoc.verificationMethod || []) as Array<Record<string, unknown>>
    const vm = vms.find(v => v.id === fullId || v.id === fragment || (typeof v.id === 'string' && v.id.endsWith(`#${fragment}`)))
    if (vm) {
      return {
        contextUrl: null,
        documentUrl: url,
        document: {
          '@context': didDoc['@context'] || [
            'https://www.w3.org/ns/did/v1',
            'https://w3id.org/security/suites/ed25519-2020/v1'
          ],
          ...vm,
        },
      }
    }
  }

  return {
    contextUrl: null,
    documentUrl: url,
    document: didDoc,
  }
}

export async function documentLoader(url: string): Promise<RemoteDocument> {
  if (url.startsWith('did:key:')) return resolveDidKey(url)
  if (url.startsWith('did:web:')) return resolveDidWeb(url)

  if (cache.has(url)) {
    return { contextUrl: null, documentUrl: url, document: cache.get(url) }
  }

  const document = await fetchContext(url)
  cache.set(url, document)
  return { contextUrl: null, documentUrl: url, document }
}
