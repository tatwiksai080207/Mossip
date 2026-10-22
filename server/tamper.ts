import { Router, type Request, type Response } from 'express'

export type TamperMode = 'none' | 'signature' | 'expired'

let activeTamperMode: TamperMode = 'none'

export function getActiveTamperMode(): TamperMode {
  return activeTamperMode
}

export function setTamperMode(mode: TamperMode): void {
  activeTamperMode = mode
  console.log('[tamper] activeTamperMode updated to:', activeTamperMode)
}

export function tamperProof(proofObj: any, mode: TamperMode): void {
  if (!proofObj) return
  if (Array.isArray(proofObj)) {
    for (const p of proofObj) tamperProof(p, mode)
    return
  }
  if (typeof proofObj === 'object') {
    if (mode === 'signature') {
      if (proofObj.proofValue) {
        proofObj.proofValue = String(proofObj.proofValue).slice(0, -10) + 'TAMPERED99'
      }
      if (proofObj.jws) {
        proofObj.jws = String(proofObj.jws).slice(0, -10) + 'TAMPERED99'
      }
      if (proofObj.signatureValue) {
        proofObj.signatureValue = String(proofObj.signatureValue).slice(0, -10) + 'TAMPERED99'
      }
      if (!proofObj.proofValue && !proofObj.jws && !proofObj.signatureValue) {
        proofObj.proofValue = 'z2f6dPbkYbfKTFSerdR4pro59TAMPERED99'
      }
    }
  }
}

export function tamperVc(vc: any, mode: TamperMode): any {
  if (!vc) return vc
  if (typeof vc === 'string') {
    const trimmed = vc.trim()
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed)
        return JSON.stringify(tamperVc(parsed, mode))
      } catch {}
    } else if (trimmed.includes('.')) {
      if (mode === 'signature') {
        return trimmed.slice(0, -10) + 'TAMPERED99'
      } else if (mode === 'expired') {
        return trimmed + '.tampered'
      }
    }
    return vc
  }
  if (typeof vc === 'object') {
    tamperProof(vc.proof, mode)
    if (mode === 'expired') {
      vc.expirationDate = '2020-01-01T00:00:00Z'
      vc.validUntil = '2020-01-01T00:00:00Z'
    }
  }
  return vc
}

export function applyTamperToObject(vpObj: any, mode: TamperMode): any {
  const cloned = JSON.parse(JSON.stringify(vpObj))
  if (cloned.proof) {
    tamperProof(cloned.proof, mode)
  }
  if (cloned.verifiableCredential) {
    if (Array.isArray(cloned.verifiableCredential)) {
      cloned.verifiableCredential = cloned.verifiableCredential.map((vc: any) => tamperVc(vc, mode))
    } else {
      cloned.verifiableCredential = tamperVc(cloned.verifiableCredential, mode)
    }
  }
  if (cloned.credentialSubject) {
    tamperVc(cloned, mode)
  }
  if (mode === 'expired') {
    cloned.expirationDate = '2020-01-01T00:00:00Z'
    cloned.validUntil = '2020-01-01T00:00:00Z'
  }
  return cloned
}

export function applyTamperingToVpToken(vpTokenRaw: any, mode: TamperMode): any {
  if (mode === 'none' || !vpTokenRaw) return vpTokenRaw

  try {
    if (typeof vpTokenRaw === 'string') {
      const trimmed = vpTokenRaw.trim()
      if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
        const parsed = JSON.parse(trimmed)
        const tampered = applyTamperToObject(parsed, mode)
        let resultStr = JSON.stringify(tampered)
        if (mode === 'signature' && !resultStr.includes('TAMPERED99')) {
          resultStr = resultStr.replace(/("proofValue"\s*:\s*")([^"]+)(")/g, (_m, p1, p2, p3) => `${p1}${p2.slice(0, -10)}TAMPERED99${p3}`)
          resultStr = resultStr.replace(/("jws"\s*:\s*")([^"]+)(")/g, (_m, p1, p2, p3) => `${p1}${p2.slice(0, -10)}TAMPERED99${p3}`)
        }
        return resultStr
      } else if (trimmed.includes('~')) {
        // SD-JWT: corrupt signature or append .tampered
        if (mode === 'signature') {
          return trimmed.replace(/[a-zA-Z0-9_-]{10}$/, 'BAD_SIG_99')
        } else if (mode === 'expired') {
          return trimmed + '.tampered'
        }
      } else {
        // Compact JWT
        if (mode === 'signature') {
          return trimmed.slice(0, -10) + 'BAD_SIG_99'
        } else if (mode === 'expired') {
          return trimmed + '.tampered'
        }
      }
    } else if (typeof vpTokenRaw === 'object') {
      return applyTamperToObject(vpTokenRaw, mode)
    }
  } catch (err) {
    console.error('[tamper] Error applying tampering to vp_token:', err)
  }

  return vpTokenRaw
}

export const tamperRouter = Router()

tamperRouter.get('/', (_req: Request, res: Response) => {
  res.json({ tamperMode: activeTamperMode })
})

tamperRouter.post('/', (req: Request, res: Response) => {
  if (req.body?.tamperMode) {
    setTamperMode(req.body.tamperMode)
  }
  res.json({ tamperMode: activeTamperMode })
})
