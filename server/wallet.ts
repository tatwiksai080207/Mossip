/**
 * The playground's holder wallet.
 *
 * Deliberately written against the specs rather than against our own issuer: it
 * discovers metadata, picks a grant from what the issuer actually advertises, and
 * fails with a specific reason when the issuer offers nothing it can drive
 * headlessly. That is what makes it useful as an interoperability probe — pointed
 * at Inji Certify it produces the same step log as when pointed at our issuer,
 * so the two are directly comparable.
 *
 * Modularized into:
 *   - ./wallet/types.ts
 *   - ./wallet/offer-parser.ts
 *   - ./wallet/fallback-credentials.ts
 *   - ./wallet/presentation.ts
 *   - ./wallet/issuance.ts
 */

import { Router, type Request, type Response } from 'express'
import * as jose from 'jose'
import { generateP256Key, generateEd25519Key, type PlaygroundKey } from './keys'
import {
  type StepStatus,
  type WalletStep,
  type HeldCredential,
  type CredentialOffer,
  type AcceptOfferResult,
  type Wallet,
} from './wallet/types'
import { parseOffer } from './wallet/offer-parser'
import { createWalletPresentation } from './wallet/presentation'
import { executeAcceptOffer, type AcceptOfferOptions } from './wallet/issuance'

export type {
  StepStatus,
  WalletStep,
  HeldCredential,
  CredentialOffer,
  AcceptOfferResult,
  Wallet,
}
export { parseOffer }

const WALLET_P256_JWK: jose.JWK = {
  kty: 'EC',
  crv: 'P-256',
  x: 'BzV6h9VA0LUy40IHpPJ8u4--3USWhyB6MmZ3kIf-9mE',
  y: '3vty_EJDI45Amq9FaBlGdZw1vEte84rgz0FHqEjwmuQ',
  d: 'a9nf9dAtJpylInHxWGuQx2mXViu8cZudDz5ng1dhMb0',
}

export async function createWallet(): Promise<Wallet> {
  // Two keys for two different cryptographic roles:
  //   - issueKey (P-256 / ES256): signs the OpenID4VCI proof-of-possession JWT.
  //     Certify 0.14.0 validates proofs using RS256 or ES256 — P-256 satisfies both.
  //   - presentKey (Ed25519 / EdDSA): signs Verifiable Presentations using
  //     Ed25519Signature2020. The LD-Proof suite requires an Ed25519 key and
  //     won't accept P-256.
  const key: PlaygroundKey = await generateP256Key(WALLET_P256_JWK)
  const presentationKey: PlaygroundKey = await generateEd25519Key(Buffer.from('inji-playground-wallet-seed-1234'))
  const held = new Map<string, HeldCredential>()

  const acceptOffer = (
    input: unknown,
    opts: AcceptOfferOptions = {}
  ): Promise<AcceptOfferResult> =>
    executeAcceptOffer(input, opts, { key, presentationKey, held })

  // ── HTTP surface ──────────────────────────────────────────────────────────
  const router = Router()

  router.get('/', (_req, res) => {
    res.json({
      holder_did: key.did,
      verification_method: key.verificationMethod,
      presentation_did: presentationKey.did,
      presentation_verification_method: presentationKey.verificationMethod,
      count: held.size,
    })
  })

  router.get('/credentials', (_req, res) => {
    res.json({ holderDid: key.did, credentials: [...held.values()] })
  })

  router.delete('/credentials', (_req, res) => {
    held.clear()
    res.json({ cleared: true })
  })

  router.post('/accept-offer', async (req: Request, res: Response) => {
    const { offer, offerUri, accessToken, txCode, authCode, clientId, codeVerifier, redirectUri } = req.body ?? {}
    const result = await acceptOffer(offer ?? offerUri, {
      accessToken,
      txCode,
      authCode,
      clientId,
      codeVerifier,
      redirectUri,
    })
    res.status(result.success ? 200 : 400).json(result)
  })

  /**
   * Signs a Verifiable Presentation over a held credential, bound to the
   * verifier's nonce. Supports both W3C VC (ldp_vp), IETF SD-JWT VC (vc+sd-jwt),
   * and ISO mdoc (mso_mdoc), with optional tamper mode for negative-path testing.
   */
  router.post('/present', async (req: Request, res: Response) => {
    const { credentialId, nonce, clientId, tamper } = req.body ?? {}
    if (!nonce) {
      res.status(400).json({ error: 'A verifier nonce is required to bind the presentation' })
      return
    }

    const target = credentialId ? held.get(credentialId) : [...held.values()].at(-1)
    if (!target) {
      res.status(404).json({ error: 'No such credential in the wallet', available: [...held.keys()] })
      return
    }

    try {
      const presentation = await createWalletPresentation({
        credential: target,
        key,
        presentationKey,
        nonce: String(nonce),
        clientId: clientId ? String(clientId) : undefined,
        tamper,
      })
      res.json(presentation)
    } catch (err: any) {
      if (err.message && err.message.includes('not implemented yet')) {
        res.status(400).json({ error: err.message })
      } else {
        res.status(500).json({ error: 'Failed to sign the presentation', detail: String(err) })
      }
    }
  })

  return { router, key, presentationKey, credentials: () => [...held.values()], acceptOffer }
}
