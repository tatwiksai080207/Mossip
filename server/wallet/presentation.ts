import { type PlaygroundKey } from '../keys'
import { signPresentation } from '../formats/ldp'
import { createSdJwtPresentation } from '../formats/sd-jwt'
import { createMdocPresentation } from '../formats/mdoc'
import { type HeldCredential } from './types'

export interface PresentationOptions {
  credential: HeldCredential
  key: PlaygroundKey
  presentationKey: PlaygroundKey
  nonce: string
  clientId?: string
  tamper?: 'signature' | 'expired'
}

export interface PresentationResult {
  vp_token: unknown
  holderDid: string
  credentialId: string
  format: string
  tampered: boolean
}

export async function createWalletPresentation(opts: PresentationOptions): Promise<PresentationResult> {
  const { credential, key, presentationKey, nonce, clientId, tamper } = opts

  if (credential.format !== 'ldp_vc' && credential.format !== 'vc+sd-jwt' && credential.format !== 'mso_mdoc') {
    throw new Error(`Presenting ${credential.format} is not implemented yet`)
  }

  if (credential.format === 'mso_mdoc') {
    let vp = await createMdocPresentation({
      credential: credential.credential as any,
      holderKey: key, // P-256 key matching holder
      nonce: String(nonce),
      audience: clientId ? String(clientId) : undefined,
    })
    if (tamper === 'signature') {
      try {
        const vpObj = JSON.parse(vp)
        if (vpObj.documents?.[0]?.issuerSigned?.issuerAuth?.signature) {
          vpObj.documents[0].issuerSigned.issuerAuth.signature =
            vpObj.documents[0].issuerSigned.issuerAuth.signature.slice(0, -10) + 'BAD_SIG_99'
        }
        if (vpObj.documents?.[0]?.deviceSigned?.deviceAuth?.deviceSignature) {
          vpObj.documents[0].deviceSigned.deviceAuth.deviceSignature =
            vpObj.documents[0].deviceSigned.deviceAuth.deviceSignature.slice(0, -10) + 'BAD_DEV_99'
        }
        vp = JSON.stringify(vpObj)
      } catch {
        vp = vp.replace(/[a-zA-Z0-9_-]{10}$/, 'BAD_SIG_99')
      }
    } else if (tamper === 'expired') {
      try {
        const vpObj = JSON.parse(vp)
        if (vpObj.documents?.[0]?.issuerSigned?.issuerAuth?.mso?.validityInfo) {
          vpObj.documents[0].issuerSigned.issuerAuth.mso.validityInfo.validUntil = '2020-01-01T00:00:00Z'
        }
        vp = JSON.stringify(vpObj)
      } catch {
        vp = vp + '.tampered'
      }
    }
    return {
      vp_token: vp,
      holderDid: key.did,
      credentialId: credential.id,
      format: 'mso_mdoc',
      tampered: Boolean(tamper),
    }
  }

  if (credential.format === 'vc+sd-jwt') {
    let vp = await createSdJwtPresentation({
      credential: String(credential.credential),
      holderKey: key, // P-256 key matching cnf
      nonce: String(nonce),
      audience: clientId ? String(clientId) : undefined,
    })
    if (tamper === 'signature') {
      // Corrupt the signature segment
      vp = vp.replace(/[a-zA-Z0-9_-]{10}$/, 'BAD_SIG_99')
    } else if (tamper === 'expired') {
      vp = vp + '.tampered'
    }
    return {
      vp_token: vp,
      holderDid: key.did,
      credentialId: credential.id,
      format: 'vc+sd-jwt',
      tampered: Boolean(tamper),
    }
  }

  // ldp_vc flow
  let vp = await signPresentation({
    credentials: [credential.credential as Record<string, unknown>],
    holderKey: presentationKey,
    challenge: String(nonce),
    domain: clientId ? String(clientId) : undefined,
  })
  if (tamper === 'signature') {
    const vpObj = JSON.parse(JSON.stringify(vp))
    if (vpObj.proof?.proofValue) {
      vpObj.proof.proofValue = String(vpObj.proof.proofValue).slice(0, -10) + 'TAMPERED99'
    }
    if (vpObj.proof?.jws) {
      vpObj.proof.jws = String(vpObj.proof.jws).slice(0, -10) + 'TAMPERED99'
    }
    if (Array.isArray(vpObj.verifiableCredential) && vpObj.verifiableCredential[0]?.proof) {
      const vcProof = vpObj.verifiableCredential[0].proof
      if (vcProof.proofValue) {
        vcProof.proofValue = String(vcProof.proofValue).slice(0, -10) + 'TAMPERED99'
      }
      if (vcProof.jws) {
        vcProof.jws = String(vcProof.jws).slice(0, -10) + 'TAMPERED99'
      }
    }
    vp = vpObj
  } else if (tamper === 'expired') {
    const vpObj = JSON.parse(JSON.stringify(vp))
    if (Array.isArray(vpObj.verifiableCredential) && vpObj.verifiableCredential[0]) {
      vpObj.verifiableCredential[0].expirationDate = '2020-01-01T00:00:00Z'
    }
    vp = vpObj
  }
  return {
    vp_token: vp,
    holderDid: presentationKey.did,
    credentialId: credential.id,
    format: 'ldp_vp',
    tampered: Boolean(tamper),
  }
}
