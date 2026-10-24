import crypto from 'crypto'
import { Router, type Request, type Response } from 'express'
import { getActiveTunnelUrl } from '../../tunnel'
import { proxyRequest } from '../../proxy/http-proxy'
import { getMimotoDbClient } from './db-bridge'
import { createMdocPresentation } from '../../formats/mdoc'
import { signPresentation } from '../../formats/ldp'
import { createSdJwtPresentation } from '../../formats/sd-jwt'

export interface PresentationBridgeDeps {
  playgroundIssuer: any
  playgroundWallet: any
  localMimotoHost: string
}

export function parseAuthPayload(rawText: string): any {
  if (!rawText) return null
  const trimmed = rawText.trim()
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      return JSON.parse(trimmed)
    } catch {}
  }
  const parts = trimmed.split('.')
  if (parts.length >= 2) {
    try {
      return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'))
    } catch {}
  }
  return null
}

export function createMimotoPresentationRouter(deps: PresentationBridgeDeps): Router {
  const { playgroundIssuer, playgroundWallet, localMimotoHost } = deps
  const router = Router()

  let lastPresentationSession: any = null
  const mimotoPresentationSessions = new Map<
    string,
    {
      walletId: string
      presentationId: string
      authRequestUrl?: string
      requestUri?: string
      authPayload?: any
      verifier?: any
    }
  >()

  router.post('/v1/mimoto/wallets/:walletId/presentations', async (req: Request, res: Response, next) => {
    const walletId = String(req.params.walletId)
    const authUrl = req.body?.authorizationRequestUrl || ''
    console.log(`[presentation-bridge] Intercepted POST /wallets/${walletId}/presentations:`, authUrl)

    let requestUri = ''
    let clientId = ''
    try {
      const qIdx = authUrl.indexOf('?')
      if (qIdx !== -1) {
        const qParams = new URLSearchParams(authUrl.slice(qIdx + 1))
        requestUri = qParams.get('request_uri') || ''
        clientId = qParams.get('client_id') || ''
      }
    } catch (e) {}

    try {
      const result = await proxyRequest(
        localMimotoHost,
        `/v1/mimoto/wallets/${walletId}/presentations`,
        req.method,
        req.headers as Record<string, string>,
        req.body,
      )

      const setCookie = result.headers?.get('set-cookie')
      if (setCookie) res.setHeader('set-cookie', setCookie)

      const activeTunnel = getActiveTunnelUrl().replace(/\/$/, '')

      if (result.status >= 200 && result.status < 300 && typeof result.body === 'object' && result.body !== null) {
        const respObj = result.body as any
        const presentationId = respObj.presentationId || respObj.response?.presentationId
        if (presentationId) {
          let authPayload: any = null
          if (requestUri) {
            try {
              let fetchUri = requestUri
              if (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1')) {
                fetchUri = fetchUri.replace(activeTunnel, 'http://127.0.0.1:3001')
              }
              fetchUri = fetchUri.replace(/host\.docker\.internal:3001|localhost:3001|inji-playground:3001/g, '127.0.0.1:3001')
              const r = await fetch(fetchUri)
              if (r.ok) {
                authPayload = parseAuthPayload(await r.text())
              }
            } catch (fetchErr) {
              console.warn('[presentation-bridge] Could not fetch request_uri authPayload:', fetchErr)
            }
          }

          const targetVerifier = respObj.verifier || respObj.response?.verifier || {}
          let redir = targetVerifier.redirectUri || targetVerifier.redirect_uri || 'http://localhost:3000'
          if (Array.isArray(redir)) redir = redir[0] || 'http://localhost:3000'
          targetVerifier.redirectUri = String(redir)
          targetVerifier.redirect_uri = String(redir)

          if (!respObj.verifier) {
            respObj.verifier = targetVerifier
          } else {
            respObj.verifier.redirectUri = String(redir)
            respObj.verifier.redirect_uri = String(redir)
          }

          if (respObj.response) {
            if (!respObj.response.verifier) respObj.response.verifier = targetVerifier
            respObj.response.verifier.redirectUri = String(redir)
            respObj.response.verifier.redirect_uri = String(redir)
          }

          const sessionData = {
            walletId,
            presentationId,
            authRequestUrl: authUrl,
            requestUri,
            authPayload,
            verifier: targetVerifier,
          }
          mimotoPresentationSessions.set(presentationId, sessionData)
          lastPresentationSession = sessionData
          console.log(`[presentation-bridge] Stored session for presentationId=${presentationId}, state=${authPayload?.state}, nonce=${authPayload?.nonce}`)
        }
        return res.status(result.status).json(respObj)
      }

      console.warn(`[presentation-bridge] Mimoto returned ${result.status}, using bridge fallback`)
      const fallbackId = crypto.randomUUID()
      let authPayload: any = null
      if (requestUri) {
        try {
          let fetchUri = requestUri
          if (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1')) {
            fetchUri = fetchUri.replace(activeTunnel, 'http://127.0.0.1:3001')
          }
          fetchUri = fetchUri.replace(/host\.docker\.internal:3001|localhost:3001|inji-playground:3001/g, '127.0.0.1:3001')
          const r = await fetch(fetchUri)
          if (r.ok) {
            authPayload = parseAuthPayload(await r.text())
          }
        } catch (fetchErr) {
          console.warn('[presentation-bridge] Fallback authPayload fetch error:', fetchErr)
        }
      }
      const fallbackSession = {
        walletId,
        presentationId: fallbackId,
        authRequestUrl: authUrl,
        requestUri,
        authPayload,
        verifier: { name: clientId || 'localhost-verifier', trusted: true, redirectUri: 'http://localhost:3000', redirect_uri: 'http://localhost:3000' },
      }
      mimotoPresentationSessions.set(fallbackId, fallbackSession)
      lastPresentationSession = fallbackSession
      return res.status(200).json({
        presentationId: fallbackId,
        verifier: {
          name: clientId || 'localhost-verifier',
          trusted: true,
          redirectUri: 'http://localhost:3000',
          redirect_uri: 'http://localhost:3000',
        },
      })
    } catch (err) {
      console.error('[presentation-bridge] Error in POST /presentations:', err)
      next()
    }
  })

  router.get('/v1/mimoto/wallets/:walletId/presentations/:presentationId/credentials', async (req: Request, res: Response) => {
    const walletId = String(req.params.walletId)
    const presentationId = String(req.params.presentationId)
    const session = mimotoPresentationSessions.get(presentationId) || lastPresentationSession
    const authPayload = session?.authPayload
    const pexDescriptor = authPayload?.presentation_definition?.input_descriptors?.[0]
    const pexExpectedFormats = pexDescriptor?.format ? Object.keys(pexDescriptor.format) : []
    const pexPattern = pexDescriptor?.constraints?.fields?.[0]?.filter?.pattern

    try {
      const client = await getMimotoDbClient()
      const dbRes = await client.query(
        `SELECT id, credential, credential_metadata FROM public.verifiable_credentials WHERE wallet_id = $1`,
        [walletId]
      )
      await client.end().catch(() => {})

      const PEX_PATTERN_ALIASES: Record<string, string[]> = {
        'EuropeanHigherEducationDiploma': ['sphereon-diploma-vcdm20', 'EuropeanHigherEducationDiploma'],
        'sphereon-diploma-vcdm20': ['EuropeanHigherEducationDiploma', 'sphereon-diploma-vcdm20'],
        'EuropeanHealthInsuranceCard': ['sphereon-ehic-vcdm11', 'EuropeanHealthInsuranceCard'],
        'sphereon-ehic-vcdm11': ['EuropeanHealthInsuranceCard', 'sphereon-ehic-vcdm11'],
        'EuropeanPersonIdentificationData': [
          'sphereon-eudi-pid',
          'https://credential-issuer.sphereon.com/credentials/eudi-pid',
          'EuropeanPersonIdentificationData',
          'eudi-pid',
        ],
        'sphereon-eudi-pid': [
          'EuropeanPersonIdentificationData',
          'https://credential-issuer.sphereon.com/credentials/eudi-pid',
          'sphereon-eudi-pid',
          'eudi-pid',
        ],
        'https://credential-issuer.sphereon.com/credentials/eudi-pid': [
          'sphereon-eudi-pid',
          'EuropeanPersonIdentificationData',
          'https://credential-issuer.sphereon.com/credentials/eudi-pid',
          'eudi-pid',
        ],
        'FarmerCredential_SD_JWT': [
          'https://inji.mosip.io/credentials/farmer-identity',
          'farmer-sdjwt',
          'FarmerCredential_SD_JWT',
        ],
        'https://inji.mosip.io/credentials/farmer-identity': [
          'FarmerCredential_SD_JWT',
          'farmer-sdjwt',
          'https://inji.mosip.io/credentials/farmer-identity',
        ],
        'PlaygroundIdentityCredential_SDJWT': [
          'https://inji-playground.mosip.dev/credentials/identity',
          'PlaygroundIdentityCredential_SDJWT',
          'PlaygroundIdentityCredential',
        ],
        'https://inji-playground.mosip.dev/credentials/identity': [
          'PlaygroundIdentityCredential_SDJWT',
          'PlaygroundIdentityCredential',
          'https://inji-playground.mosip.dev/credentials/identity',
        ],
        'waltid-identity-sdjwt': [
          'https://walt.id/credentials/identity',
          'waltid-identity-sdjwt',
          'PlaygroundIdentityCredential',
        ],
        'https://walt.id/credentials/identity': [
          'waltid-identity-sdjwt',
          'PlaygroundIdentityCredential',
          'https://walt.id/credentials/identity',
        ],
        'PlaygroundIdentityCredential': [
          'waltid-identity-ldp-vcdm11',
          'waltid-identity-ldp-vcdm20',
          'waltid-identity-sdjwt',
          'PlaygroundIdentityCredential',
        ],
        'waltid-identity-ldp-vcdm11': ['PlaygroundIdentityCredential', 'waltid-identity-ldp-vcdm11'],
        'waltid-identity-ldp-vcdm20': ['PlaygroundIdentityCredential', 'waltid-identity-ldp-vcdm20'],
        'FarmerCredential': ['farmer-ldp-vcdm11', 'farmer-ldp-vcdm20', 'FarmerCredential'],
        'farmer-ldp-vcdm11': ['FarmerCredential', 'farmer-ldp-vcdm11'],
        'farmer-ldp-vcdm20': ['FarmerCredential', 'farmer-ldp-vcdm20'],
        'DrivingLicenseCredential': [
          'org.iso.18013.5.1.mDL',
          'mock-mdl-drivinglicense',
          'waltid-drivinglicense-mdoc',
          'DrivingLicenseCredential',
        ],
        'org.iso.18013.5.1.mDL': ['DrivingLicenseCredential', 'org.iso.18013.5.1.mDL'],
      }

      const availableCredentials: any[] = []
      for (const row of dbRes.rows) {
        let meta = row.credential_metadata
        if (typeof meta === 'string') {
          try {
            meta = JSON.parse(meta)
          } catch (e) {}
        }
        const credType = meta?.credentialType || meta?.credentialConfigurationId || ''
        const isFarmer = credType.includes('Farmer') || meta?.issuerId === 'Farmer'
        const isSphereon = credType.includes('sphereon') || credType.includes('European') || meta?.issuerId === 'Sphereon'
        const isMdoc = credType.includes('mDoc') || credType.includes('DrivingLicense') || credType.toLowerCase().includes('mdoc')
        const isSdJwt = credType.includes('SD_JWT') || credType.includes('sd-jwt') || credType.includes('pid') || credType.includes('eudi') || meta?.format === 'vc+sd-jwt'

        const displayName =
          meta?.credentialTypeDisplayName ||
          (isSphereon && isSdJwt
            ? 'European Identity (EUDI PID)'
            : isSphereon && (credType.includes('ehic') || credType.includes('EuropeanHealthInsuranceCard'))
            ? 'European Health Insurance Card'
            : isSphereon
            ? 'European Higher Education Diploma'
            : isFarmer
            ? 'Farmer Verifiable Credential'
            : isMdoc
            ? 'Mobile Driving License'
            : 'Playground Identity Credential')
        const logo =
          meta?.credentialTypeLogo ||
          (isSphereon
            ? 'https://sphereon.com/favicon.ico'
            : isFarmer
            ? 'https://mosip.github.io/inji-config/logos/agro-vertias-logo.png'
            : 'https://api.collab.mosip.net/inji/mosip-logo.png')
        const format = meta?.format || (isMdoc ? 'mso_mdoc' : isSdJwt ? 'vc+sd-jwt' : 'ldp_vc')

        let decodedPayloadStr = ''
        if (typeof row.credential === 'string' && isSdJwt) {
          try {
            const jwtPart = row.credential.split('~')[0]
            const payloadJson = Buffer.from(jwtPart.split('.')[1], 'base64url').toString('utf8')
            decodedPayloadStr = payloadJson
          } catch (e) {}
        }
        const rowStr = JSON.stringify(row) + ' ' + decodedPayloadStr

        // Filter against presentation_definition if provided
        if (pexDescriptor) {
          if (pexExpectedFormats.length > 0) {
            const matchesFormat = pexExpectedFormats.some(f => f === format || (f === 'ldp_vp' && format === 'ldp_vc'))
            if (!matchesFormat) {
              console.log(`[presentation-bridge] Filter: credential ${row.id} (${format}) does not match requested format ${pexExpectedFormats.join('/')}`)
              continue
            }
          }
          if (pexPattern) {
            const aliases = [pexPattern, ...(PEX_PATTERN_ALIASES[pexPattern] || [])]
            const matchesPattern = aliases.some(a => rowStr.includes(a))
            if (!matchesPattern) {
              console.log(`[presentation-bridge] Filter: credential ${row.id} does not match requested pattern ${pexPattern}`)
              continue
            }
          }
        }

        availableCredentials.push({
          credentialId: row.id,
          credentialTypeDisplayName: displayName,
          credentialTypeLogo: logo,
          format: format,
          issuer: meta?.issuer || (isFarmer ? 'Farmer' : isSphereon ? 'Sphereon' : 'Playground'),
        })
      }

      console.log(`[presentation-bridge] Found ${availableCredentials.length} credentials for wallet ${walletId}:`, availableCredentials.map(c => c.credentialTypeDisplayName))

      return res.status(200).json({
        availableCredentials,
        missingClaims: [],
      })
    } catch (err) {
      console.error('[presentation-bridge] Error fetching presentation credentials:', err)
      return res.status(500).json({ error: 'Failed to fetch presentation credentials', detail: String(err) })
    }
  })

  router.patch('/v1/mimoto/wallets/:walletId/presentations/:presentationId', async (req: Request, res: Response) => {
    const walletId = String(req.params.walletId)
    const presentationId = String(req.params.presentationId)
    console.log(`[presentation-bridge] PATCH presentation ${presentationId} for wallet ${walletId}, body:`, JSON.stringify(req.body))

    if (req.body?.error) {
      console.log(`[presentation-bridge] Presentation rejected or error:`, req.body.error)
      return res.status(200).json({ redirectUri: 'http://localhost:3000' })
    }

    const selectedCredentials: string[] = req.body?.selectedCredentials || []
    if (selectedCredentials.length === 0) {
      return res.status(400).json({ error: 'No credentials selected' })
    }

    try {
      const client = await getMimotoDbClient()
      const dbRes = await client.query(
        `SELECT id, credential, credential_metadata FROM public.verifiable_credentials WHERE id = $1 AND wallet_id = $2`,
        [selectedCredentials[0], walletId]
      )

      if (dbRes.rows.length === 0) {
        await client.end().catch(() => {})
        return res.status(404).json({ error: 'Selected credential not found in wallet' })
      }

      const row = dbRes.rows[0]
      let meta = row.credential_metadata
      if (typeof meta === 'string') {
        try {
          meta = JSON.parse(meta)
        } catch (e) {}
      }

      let session = mimotoPresentationSessions.get(presentationId) || lastPresentationSession
      let authPayload = session?.authPayload

      const activeTunnel = getActiveTunnelUrl().replace(/\/$/, '')

      if (!authPayload && session?.requestUri) {
        try {
          let fetchUri = session.requestUri
          if (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1')) {
            fetchUri = fetchUri.replace(activeTunnel, 'http://127.0.0.1:3001')
          }
          fetchUri = fetchUri.replace(/host\.docker\.internal:3001|localhost:3001|inji-playground:3001/g, '127.0.0.1:3001')
          const r = await fetch(fetchUri)
          if (r.ok) {
            authPayload = parseAuthPayload(await r.text())
          }
        } catch (fetchErr) {
          console.warn('[presentation-bridge] Error fetching requestUri authPayload in PATCH:', fetchErr)
        }
      }

      const nonce = authPayload?.nonce || crypto.randomUUID()
      const clientId = authPayload?.client_id || 'localhost-verifier'
      let responseUri = authPayload?.response_uri || `${activeTunnel}/v1/verify/v2/vp-submission/direct-post`

      const stateFromUri = (session?.requestUri || '').match(/vp-request\/([^?\/]+)/)?.[1]
      const state = authPayload?.state || stateFromUri || ''

      const format = meta?.format || 'ldp_vc'
      let vpToken: any
      let presFormat = 'ldp_vp'

      if (format === 'mso_mdoc') {
        presFormat = 'mso_mdoc'
        vpToken = await createMdocPresentation({
          credential: row.credential,
          holderKey: playgroundWallet.key,
          nonce: String(nonce),
          audience: String(clientId),
        })
      } else if (format === 'vc+sd-jwt') {
        presFormat = 'vc+sd-jwt'
        vpToken = await createSdJwtPresentation({
          credential: String(row.credential),
          holderKey: playgroundWallet.key,
          nonce: String(nonce),
          audience: String(clientId),
        })
      } else {
        presFormat = 'ldp_vp'
        let credObj = row.credential
        if (typeof credObj === 'string') {
          try {
            credObj = JSON.parse(credObj)
          } catch (e) {}
        }
        vpToken = await signPresentation({
          credentials: [credObj],
          holderKey: playgroundIssuer.key,
          challenge: String(nonce),
          domain: String(clientId),
        })
      }

      const descriptorId = authPayload?.presentation_definition?.input_descriptors?.[0]?.id || 'credential_1'
      const submission = {
        id: `submission_${Date.now()}`,
        definition_id: authPayload?.presentation_definition?.id || 'presentation_definition',
        descriptor_map: [
          {
            id: descriptorId,
            format: presFormat,
            path: '$',
          },
        ],
      }

      const params = new URLSearchParams()
      params.set('vp_token', typeof vpToken === 'string' ? vpToken : JSON.stringify(vpToken))
      params.set('presentation_submission', JSON.stringify(submission))
      if (state) {
        params.set('state', state)
      }

      let directPostTarget = responseUri
      if (activeTunnel && !activeTunnel.includes('localhost') && !activeTunnel.includes('127.0.0.1')) {
        directPostTarget = directPostTarget.replace(activeTunnel, 'http://127.0.0.1:3001')
      }
      directPostTarget = directPostTarget
        .replace(/host\.docker\.internal:3001/g, '127.0.0.1:3001')
        .replace(/localhost:3001/g, '127.0.0.1:3001')
        .replace(/inji-playground:3001/g, '127.0.0.1:3001')

      if (state && !directPostTarget.includes('state=')) {
        directPostTarget += (directPostTarget.includes('?') ? '&' : '?') + 'state=' + encodeURIComponent(state)
      }

      console.log(`[presentation-bridge] Submitting direct-post to: ${directPostTarget}`)
      const submitRes = await fetch(directPostTarget, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      })

      const submitJson = (await submitRes.json().catch(() => ({}))) as any
      console.log(`[presentation-bridge] Verifier response (${submitRes.status}):`, submitJson)

      if (submitRes.status >= 400) {
        console.error('[presentation-bridge] Direct post rejected by verifier:', submitRes.status, submitJson)
        await client.end().catch(() => {})
        return res.status(submitRes.status).json(submitJson)
      }

      await client
        .query(
          `INSERT INTO public.verifiable_presentations (id, wallet_id, auth_request, presentation_data, verifier_id, status, requested_at, created_at, consent)
         VALUES ($1, $2, $3, $4, $5, 'success', now(), now(), true)
         ON CONFLICT (id) DO UPDATE SET status = 'success', presentation_data = $4`,
          [
            presentationId,
            walletId,
            JSON.stringify({ authorizationRequestUrl: session?.authRequestUrl || '' }),
            JSON.stringify({ selectedCredentials }),
            clientId,
          ]
        )
        .catch(e => console.warn('[presentation-bridge] Error inserting into verifiable_presentations:', e))

      await client.end().catch(() => {})

      const finalRedirectUri = submitJson?.redirect_uri || submitJson?.redirectUri || 'http://localhost:3000'
      return res.status(200).json({
        redirectUri: finalRedirectUri,
        redirect_uri: finalRedirectUri,
        response: {
          redirectUri: finalRedirectUri,
          redirect_uri: finalRedirectUri,
        },
      })
    } catch (err) {
      console.error('[presentation-bridge] Error processing PATCH /presentations:', err)
      return res.status(500).json({ error: 'Failed to complete presentation', detail: String(err) })
    }
  })

  return router
}
