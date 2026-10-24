/**
 * Sphereon Reference Wallet (External / Non-Inji Wallet Engine)
 *
 * Implements an independent, standards-compliant holder wallet modeled after
 * the Sphereon Mobile / IDK Wallet specifications.
 *
 * Demonstrates cross-ecosystem interoperability by:
 * 1. Deriving an independent did:key identity distinct from Inji Web / Mimoto.
 * 2. Accepting OpenID4VCI (Draft 13/15) credential offers from Inji Certify,
 *    walt.id Issuer, and Sphereon Issuer.
 * 3. Producing authentic W3C VP / SD-JWT VP presentations bound to the verifier's
 *    challenge nonce and audience for Inji Verify, walt.id, and Sphereon Verifier.
 */

import { Router, type Request, type Response } from 'express'
import { generateP256Key, generateEd25519Key, type PlaygroundKey } from '../keys'
import {
  type HeldCredential,
  type AcceptOfferResult,
} from '../wallet/types'
import { executeAcceptOffer, type AcceptOfferOptions } from '../wallet/issuance'
import { createWalletPresentation } from '../wallet/presentation'

export interface SphereonWalletService {
  router: Router
  key: PlaygroundKey
  presentationKey: PlaygroundKey
  heldCredentials: Map<string, HeldCredential>
  acceptOffer(input: unknown, opts?: AcceptOfferOptions): Promise<AcceptOfferResult>
}

export async function createSphereonWallet(): Promise<SphereonWalletService> {
  // Independent cryptographic keypairs representing the Sphereon wallet instance
  const key: PlaygroundKey = await generateP256Key()
  const presentationKey: PlaygroundKey = await generateEd25519Key()
  const held = new Map<string, HeldCredential>()

  console.log(`[sphereon-wallet] Initialized Sphereon Wallet with holder DID: ${presentationKey.did}`)

  const acceptOffer = (input: unknown, opts: AcceptOfferOptions = {}): Promise<AcceptOfferResult> =>
    executeAcceptOffer(input, opts, { key, presentationKey, held })

  const router = Router()

  /**
   * Accepts an OpenID4VCI credential offer (e.g. from Inji Certify or walt.id)
   */
  router.post('/accept-offer', async (req: Request, res: Response) => {
    const { offer, offerUri, accessToken, txCode, authCode, clientId, codeVerifier, redirectUri } = req.body ?? {}
    const targetOffer = offer ?? offerUri
    if (!targetOffer) {
      res.status(400).json({ error: 'Missing offer in request body' })
      return
    }

    try {
      const result = await acceptOffer(targetOffer, {
        accessToken,
        txCode,
        authCode,
        clientId,
        codeVerifier,
        redirectUri,
        strictMode: true,
      })
      res.status(result.success ? 200 : 400).json(result)
    } catch (err) {
      console.error('[sphereon-wallet] accept-offer error:', err)
      res.status(500).json({ error: String(err) })
    }
  })

  /**
   * Creates and cryptographically signs a Verifiable Presentation for an OpenID4VP verifier
   */
  router.post('/present', async (req: Request, res: Response) => {
    const { credentialId, nonce, clientId, tamper } = req.body ?? {}
    if (!nonce || typeof nonce !== 'string') {
      res.status(400).json({ error: 'Missing nonce in request body' })
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
      res.json({
        ...presentation,
        walletName: 'Sphereon Reference Wallet',
        holderDid: presentationKey.did,
      })
    } catch (err) {
      console.error('[sphereon-wallet] present error:', err)
      res.status(400).json({ error: (err as Error).message })
    }
  })

  /**
   * Lists credentials currently held in the Sphereon wallet
   */
  router.get('/credentials', (_req: Request, res: Response) => {
    const out: Array<{ id: string; format: string; credential: unknown }> = []
    for (const [id, c] of held.entries()) {
      out.push({ id, format: c.format, credential: c.credential })
    }
    res.json({
      wallet: 'Sphereon Reference Wallet',
      did: presentationKey.did,
      count: out.length,
      credentials: out,
    })
  })

  return {
    router,
    key,
    presentationKey,
    heldCredentials: held,
    acceptOffer,
  }
}
