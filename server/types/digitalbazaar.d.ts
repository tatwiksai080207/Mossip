/**
 * Ambient declarations for the Digital Bazaar Data Integrity packages, which
 * ship as plain ESM with no bundled types. Narrow on purpose: only the surface
 * the playground actually uses is declared, so a typo in a call site is still a
 * compile error rather than being swallowed by `any`.
 */

declare module '@digitalbazaar/vc' {
  interface DocumentLoaderResult {
    contextUrl: null
    documentUrl: string
    document: unknown
  }
  type DocumentLoader = (url: string) => Promise<DocumentLoaderResult>

  export function issue(opts: {
    credential: Record<string, unknown>
    suite: unknown
    documentLoader: DocumentLoader
    purpose?: unknown
  }): Promise<Record<string, unknown>>

  export function verifyCredential(opts: {
    credential: Record<string, unknown>
    suite: unknown
    documentLoader: DocumentLoader
    purpose?: unknown
  }): Promise<{ verified: boolean; error?: unknown; results?: unknown }>

  export function createPresentation(opts: {
    verifiableCredential: Record<string, unknown> | Record<string, unknown>[]
    holder?: string
    id?: string
  }): Record<string, unknown>

  export function signPresentation(opts: {
    presentation: Record<string, unknown>
    suite: unknown
    challenge: string
    domain?: string
    documentLoader: DocumentLoader
    purpose?: unknown
  }): Promise<Record<string, unknown>>

  export function verify(opts: {
    presentation: Record<string, unknown>
    suite: unknown
    challenge: string
    domain?: string
    documentLoader: DocumentLoader
    presentationPurpose?: unknown
  }): Promise<{ verified: boolean; error?: unknown; results?: unknown }>
}

declare module '@digitalbazaar/ed25519-signature-2020' {
  export class Ed25519Signature2020 {
    constructor(opts?: { key?: unknown; signer?: unknown; date?: string })
    type: string
  }
}

declare module '@digitalbazaar/ed25519-verification-key-2020' {
  export class Ed25519VerificationKey2020 {
    static generate(opts?: { seed?: Uint8Array; controller?: string; id?: string }): Promise<Ed25519VerificationKey2020>
    static from(key: Record<string, unknown>): Promise<Ed25519VerificationKey2020>
    id: string
    controller: string
    type: string
    publicKeyMultibase: string
    privateKeyMultibase: string
    export(opts?: { publicKey?: boolean; privateKey?: boolean }): Record<string, unknown>
  }
}
