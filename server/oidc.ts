import { Router, type Request, type Response } from 'express'
import crypto from 'crypto'
import * as jose from 'jose'
import { getPublicBaseUrl } from './tunnel'

export const oidcRouter = Router()

// Generate an EC keypair for signing OIDC tokens (ES256)
let privateKey: any = null
let jwk: Record<string, unknown> | null = null
const KEY_ID = 'playground-oidc-key-1'

export async function initKeys() {
  const { publicKey: pk, privateKey: sk } = await jose.generateKeyPair('ES256')
  privateKey = sk
  jwk = await jose.exportJWK(pk)
  jwk.kid = KEY_ID
  jwk.use = 'sig'
  jwk.alg = 'ES256'
  return { privateKey, jwk }
}

const keyInitPromise = initKeys().catch(console.error)

export async function ensureKeys() {
  if (!privateKey) {
    await keyInitPromise
  }
  return { privateKey, jwk }
}

// Authentic Farmer Identities from mosip-stack/config/farmer_identity_data.csv
export interface FarmerProfile {
  id: string
  fullName: string
  mobileNumber: string
  dateOfBirth: string
  gender: string
  state: string
  district: string
  villageOrTown: string
  postalCode: string
  landArea: string
  landOwnershipType: string
  primaryCropType: string
  secondaryCropType: string
  farmerID: string
}

export const FARMER_IDENTITIES: Record<string, FarmerProfile> = {
  '2154189532': {
    id: '2154189532',
    fullName: 'Gorge Cooper',
    mobileNumber: '9876543210',
    dateOfBirth: '25-05-1990',
    gender: 'Male',
    state: 'Karnataka',
    district: 'Bangalore',
    villageOrTown: 'Koramangala',
    postalCode: '453000',
    landArea: '3 hectares',
    landOwnershipType: 'Owner',
    primaryCropType: 'Maize',
    secondaryCropType: 'Rice',
    farmerID: '987654321',
  },
  '8267411578': {
    id: '8267411578',
    fullName: 'James Rodrigious',
    mobileNumber: '8765432109',
    dateOfBirth: '12-11-1985',
    gender: 'Male',
    state: 'Uttar Pradesh',
    district: 'Lucknow',
    villageOrTown: 'Gomti Nagar',
    postalCode: '226010',
    landArea: '2.5 acres',
    landOwnershipType: 'Tenant',
    primaryCropType: 'Rice',
    secondaryCropType: 'Wheat',
    farmerID: '123456789',
  },
  '5860356276': {
    id: '5860356276',
    fullName: 'Jane Thompson',
    mobileNumber: '7550166914',
    dateOfBirth: '24-01-1998',
    gender: 'Female',
    state: 'Karnataka',
    district: 'Bangalore',
    villageOrTown: 'Koramangala',
    postalCode: '560068',
    landArea: '5 acres',
    landOwnershipType: 'Self-owned',
    primaryCropType: 'Cotton',
    secondaryCropType: 'Barley',
    farmerID: '4567538771',
  },
}

// In-Memory Session Stores for RFC 7636 PKCE & Pre-Auth Codes
export interface AuthSession {
  code: string
  clientId: string
  redirectUri: string
  codeChallenge?: string
  codeChallengeMethod?: string
  sub: string
  scope: string
  state?: string
  expiresAt: number
}

const authSessions = new Map<string, AuthSession>()
const preAuthRegistry = new Map<string, { sub: string; createdAt: number }>()

export function registerPreAuthCode(code: string, sub: string = '2154189532') {
  preAuthRegistry.set(code, { sub, createdAt: Date.now() })
}

// Periodic cleanup of expired authorization sessions (older than 10 minutes)
const cleanupTimer = setInterval(() => {
  const now = Date.now()
  for (const [code, session] of authSessions.entries()) {
    if (session.expiresAt < now) authSessions.delete(code)
  }
  for (const [code, entry] of preAuthRegistry.entries()) {
    if (now - entry.createdAt > 3600000) preAuthRegistry.delete(code)
  }
}, 60000)
cleanupTimer.unref()

export const discoveryHandler = (req: Request, res: Response) => {
  const publicBase = getPublicBaseUrl(req)
  const oidcBase = `${publicBase}/api/oidc`
  res.json({
    issuer: oidcBase,
    authorization_endpoint: `${oidcBase}/authorize`,
    token_endpoint: `${oidcBase}/token`,
    userinfo_endpoint: `${oidcBase}/userinfo`,
    jwks_uri: `${oidcBase}/jwks`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'urn:ietf:params:oauth:grant-type:pre-authorized_code'],
    code_challenge_methods_supported: ['S256', 'plain'],
    subject_types_supported: ['public'],
    id_token_signing_alg_values_supported: ['ES256', 'RS256'],
    scopes_supported: [
      'openid',
      'profile',
      'email',
      'phone',
      'mock_identity_vc_ldp',
      'farmer_sd_jwt',
      'sample_vc_mdoc',
    ],
    token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
  })
}

oidcRouter.get('/.well-known/openid-configuration', discoveryHandler)
oidcRouter.get('/.well-known/oauth-authorization-server', discoveryHandler)

oidcRouter.get('/jwks', async (_req, res) => {
  await ensureKeys()
  res.json({
    keys: jwk ? [jwk] : [],
  })
})

oidcRouter.get('/protocol/openid-connect/certs', async (_req, res) => {
  await ensureKeys()
  res.json({
    keys: jwk ? [jwk] : [],
  })
})

// Helper to create an authorization code
function createAuthorizationCode(
  clientId: string,
  redirectUri: string,
  sub: string,
  scope: string,
  codeChallenge?: string,
  codeChallengeMethod?: string,
  state?: string
): string {
  const code = 'auth_code_' + crypto.randomBytes(16).toString('hex')
  authSessions.set(code, {
    code,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod: codeChallengeMethod || (codeChallenge ? 'plain' : undefined),
    sub,
    scope,
    state,
    expiresAt: Date.now() + 10 * 60 * 1000, // 10 minutes
  })
  return code
}

// Executive MOSIP-Themed Interactive Citizen Authorization Endpoint
oidcRouter.get('/authorize', (req: Request, res: Response) => {
  const {
    redirect_uri,
    state,
    client_id = 'wallet',
    scope = 'openid profile mock_identity_vc_ldp',
    code_challenge,
    code_challenge_method = 'S256',
    sub = '2154189532',
    auto,
  } = req.query as Record<string, string>

  if (!redirect_uri) {
    return res.status(400).send('Missing redirect_uri parameter')
  }

  // Headless bypass or automated parameter requested
  if (auto === 'true') {
    const code = createAuthorizationCode(
      client_id,
      redirect_uri,
      sub,
      scope,
      code_challenge,
      code_challenge_method,
      state
    )
    const sep = redirect_uri.includes('?') ? '&' : '?'
    const targetUrl = `${redirect_uri}${sep}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`
    return res.redirect(targetUrl)
  }

  const farmerList = Object.values(FARMER_IDENTITIES)
  const defaultFarmer = FARMER_IDENTITIES[sub] || FARMER_IDENTITIES['2154189532']

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>MOSIP eSignet | Local OIDC Authorization</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
        body { background: #090d16; color: #f8fafc; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
        .container { background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; width: 100%; max-width: 520px; padding: 28px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6); }
        .header { display: flex; align-items: center; gap: 14px; margin-bottom: 20px; border-bottom: 1px solid #1e293b; padding-bottom: 16px; }
        .logo-box { width: 44px; height: 44px; border-radius: 10px; background: linear-gradient(135deg, #2563eb, #1d4ed8); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.4); }
        .title-box h1 { font-size: 1.15rem; font-weight: 700; color: #ffffff; letter-spacing: -0.02em; }
        .title-box p { font-size: 0.8rem; color: #94a3b8; margin-top: 2px; }
        .badge-row { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
        .badge { display: inline-flex; align-items: center; gap: 5px; font-size: 0.72rem; padding: 3px 9px; border-radius: 9999px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; }
        .badge-pkce { background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3); }
        .badge-client { background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); }
        .badge-standard { background: rgba(168, 85, 247, 0.15); color: #c084fc; border: 1px solid rgba(168, 85, 247, 0.3); }
        .section-label { font-size: 0.75rem; font-weight: 600; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 10px; }
        .farmer-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
        .farmer-card { border: 1px solid #334155; border-radius: 10px; padding: 12px 14px; background: #1e293b; cursor: pointer; transition: all 0.2s ease; display: flex; align-items: center; justify-content: space-between; }
        .farmer-card:hover { border-color: #3b82f6; background: #1e293b; }
        .farmer-card.selected { border-color: #3b82f6; background: rgba(37, 99, 235, 0.15); box-shadow: 0 0 0 1px #3b82f6; }
        .farmer-info { display: flex; flex-direction: column; gap: 2px; }
        .farmer-name { font-size: 0.92rem; font-weight: 600; color: #f1f5f9; display: flex; align-items: center; gap: 8px; }
        .farmer-sub { font-size: 0.75rem; color: #64748b; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; }
        .farmer-detail { font-size: 0.78rem; color: #94a3b8; margin-top: 2px; }
        .radio-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid #64748b; display: flex; align-items: center; justify-content: center; }
        .farmer-card.selected .radio-dot { border-color: #3b82f6; }
        .farmer-card.selected .radio-dot::after { content: ''; width: 8px; height: 8px; border-radius: 50%; background: #3b82f6; }
        .scope-box { background: rgba(15, 23, 42, 0.6); border: 1px solid #1e293b; border-radius: 8px; padding: 10px 14px; margin-bottom: 20px; font-size: 0.78rem; color: #94a3b8; }
        .scope-box strong { color: #cbd5e1; }
        .btn-submit { display: flex; align-items: center; justify-content: center; gap: 8px; width: 100%; padding: 12px; background: #2563eb; hover: background: #1d4ed8; color: white; border: none; border-radius: 10px; font-size: 0.92rem; font-weight: 600; cursor: pointer; transition: background 0.15s ease; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.35); }
        .btn-submit:hover { background: #1d4ed8; }
        .countdown-bar { margin-top: 14px; font-size: 0.75rem; color: #64748b; text-align: center; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .btn-pause { background: none; border: none; color: #38bdf8; text-decoration: underline; cursor: pointer; font-size: 0.75rem; }
        .hidden { display: none; }
        #auth-result { margin-top: 16px; padding: 14px; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16, 185, 129, 0.3); border-radius: 10px; }
        .result-title { font-size: 0.85rem; font-weight: 600; color: #34d399; margin-bottom: 8px; display: flex; align-items: center; gap: 6px; }
        .copy-group { display: flex; gap: 6px; margin-top: 8px; }
        .copy-input { flex: 1; background: #090d16; border: 1px solid #334155; border-radius: 6px; padding: 6px 10px; color: #cbd5e1; font-size: 0.75rem; font-family: ui-monospace, monospace; }
        .copy-btn { background: #334155; hover: background: #475569; color: white; border: none; border-radius: 6px; padding: 6px 12px; font-size: 0.75rem; cursor: pointer; font-weight: 600; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <div class="logo-box">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              <path d="m9 12 2 2 4-4"/>
            </svg>
          </div>
          <div class="title-box">
            <h1>MOSIP eSignet IDP</h1>
            <p>Local OpenID Connect 1.0 & RFC 7636 PKCE</p>
          </div>
        </div>

        <div class="badge-row">
          <span class="badge badge-pkce">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
            PKCE: ${code_challenge_method || 'S256'}
          </span>
          <span class="badge badge-client">Client: ${client_id}</span>
          <span class="badge badge-standard">Draft 13 OIDC</span>
        </div>

        <form id="consent-form">
          <div class="section-label">Select Citizen Identity</div>
          <div class="farmer-list">
            ${farmerList
              .map(
                (f) => `
              <div class="farmer-card ${f.id === defaultFarmer.id ? 'selected' : ''}" data-id="${f.id}" onclick="selectFarmer('${f.id}')">
                <div class="farmer-info">
                  <div class="farmer-name">
                    ${f.fullName}
                    <span class="farmer-sub">${f.id}</span>
                  </div>
                  <div class="farmer-detail">${f.state} · ${f.primaryCropType} Farmer · ${f.gender}</div>
                </div>
                <div class="radio-dot"></div>
              </div>
            `
              )
              .join('')}
          </div>

          <div class="scope-box">
            <strong>Requested Scope:</strong> ${scope}<br/>
            <strong>Claims to Release:</strong> Full Name, DOB, Gender, Mobile Number, Crop & Land Registry Data
          </div>

          <input type="hidden" id="selected-sub" name="sub" value="${defaultFarmer.id}" />

          <button type="button" class="btn-submit" id="btn-authorize" onclick="submitAuthorization()">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <polyline points="16 11 18 13 22 9"/>
            </svg>
            Authenticate & Issue Credential
          </button>
        </form>

        <div class="countdown-bar" id="countdown-container">
          <span>Auto-authorizing with default profile in <strong id="seconds">5</strong>s...</span>
          <button class="btn-pause" onclick="pauseCountdown()">Pause</button>
        </div>

        <div id="auth-result" class="hidden">
          <div class="result-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            Authorization Granted (RFC 7636 PKCE)
          </div>
          <p style="font-size: 0.75rem; color: #cbd5e1;">Redirecting to Inji Wallet... If redirect does not happen, copy the URL or code below:</p>
          <div class="copy-group">
            <input type="text" id="result-code-input" class="copy-input" readonly />
            <button class="copy-btn" onclick="copyResult()">Copy</button>
          </div>
        </div>
      </div>

      <script>
        let countdown = 5;
        let timer = null;
        let paused = false;

        function selectFarmer(id) {
          document.querySelectorAll('.farmer-card').forEach(el => el.classList.remove('selected'));
          const target = document.querySelector('.farmer-card[data-id="' + id + '"]');
          if (target) target.classList.add('selected');
          document.getElementById('selected-sub').value = id;
          pauseCountdown();
        }

        function pauseCountdown() {
          paused = true;
          const bar = document.getElementById('countdown-container');
          if (bar) bar.style.display = 'none';
          if (timer) clearInterval(timer);
        }

        timer = setInterval(() => {
          if (paused) return;
          countdown--;
          const secEl = document.getElementById('seconds');
          if (secEl) secEl.innerText = countdown;
          if (countdown <= 0) {
            clearInterval(timer);
            submitAuthorization();
          }
        }, 1000);

        async function submitAuthorization() {
          pauseCountdown();
          const btn = document.getElementById('btn-authorize');
          if (btn) {
            btn.disabled = true;
            btn.innerText = 'Minting Authorization Code...';
          }

          const selectedSub = document.getElementById('selected-sub').value;
          const payload = {
            client_id: ${JSON.stringify(client_id)},
            redirect_uri: ${JSON.stringify(redirect_uri)},
            scope: ${JSON.stringify(scope)},
            code_challenge: ${JSON.stringify(code_challenge || '')},
            code_challenge_method: ${JSON.stringify(code_challenge_method || '')},
            state: ${JSON.stringify(state || '')},
            sub: selectedSub
          };

          try {
            const res = await fetch('/api/oidc/authorize/consent', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            const data = await res.json();
            if (data.redirect_url) {
              const resBox = document.getElementById('auth-result');
              const input = document.getElementById('result-code-input');
              if (resBox && input) {
                resBox.classList.remove('hidden');
                input.value = data.redirect_url;
              }

              // PostMessage to opener if opened in a popup
              if (window.opener) {
                try {
                  window.opener.postMessage({ type: 'OAUTH_CODE', code: data.code, url: data.redirect_url }, '*');
                } catch(e) {}
              }

              setTimeout(() => {
                window.location.href = data.redirect_url;
              }, 400);
            }
          } catch(err) {
            alert('Authorization failed: ' + err.message);
            if (btn) btn.disabled = false;
          }
        }

        function copyResult() {
          const input = document.getElementById('result-code-input');
          if (input) {
            input.select();
            navigator.clipboard.writeText(input.value);
            alert('Copied to clipboard!');
          }
        }
      </script>
    </body>
    </html>
  `)
})

// Programmatic / POST Consent Handler
oidcRouter.post('/authorize/consent', (req: Request, res: Response) => {
  const {
    client_id = 'wallet',
    redirect_uri,
    scope = 'openid profile mock_identity_vc_ldp',
    code_challenge,
    code_challenge_method = 'S256',
    state,
    sub = '2154189532',
  } = req.body || {}

  if (!redirect_uri) {
    return res.status(400).json({ error: 'invalid_request', error_description: 'Missing redirect_uri' })
  }

  const code = createAuthorizationCode(
    client_id,
    redirect_uri,
    sub,
    scope,
    code_challenge,
    code_challenge_method,
    state
  )

  const sep = redirect_uri.includes('?') ? '&' : '?'
  const redirect_url = `${redirect_uri}${sep}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`

  res.json({
    code,
    redirect_url,
    state: state || null,
    sub,
  })
})

oidcRouter.get('/protocol/openid-connect/auth', (req: Request, res: Response) => {
  res.redirect('/api/oidc/authorize?' + new URLSearchParams(req.query as Record<string, string>).toString())
})

// Backwards-compatible legacy submit
oidcRouter.post('/authorize/submit', (req: Request, res: Response) => {
  const { redirect_uri, state, sub = '2154189532' } = req.body || {}
  if (!redirect_uri) {
    return res.status(400).send('Missing redirect_uri')
  }
  const code = createAuthorizationCode('wallet', redirect_uri, sub, 'openid profile')
  const sep = redirect_uri.includes('?') ? '&' : '?'
  const targetUrl = `${redirect_uri}${sep}code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ''}`
  res.redirect(targetUrl)
})

// OAuth 2.0 / OpenID Connect Token Endpoint with RFC 7636 PKCE Verification
const tokenHandler = async (req: Request, res: Response) => {
  await ensureKeys()
  if (!privateKey) {
    return res.status(500).json({ error: 'server_error', error_description: 'Signing keys not initialized' })
  }

  const publicBase = getPublicBaseUrl(req)
  const oidcBase = `${publicBase}/api/oidc`
  const clientId = req.body?.client_id || 'wallet'
  const grantType = req.body?.grant_type || 'authorization_code'
  const cNonce = `cnonce_${crypto.randomBytes(12).toString('hex')}`

  let selectedSub = '2154189532'
  let matchedScope = req.body?.scope || 'mock_identity_vc_ldp openid'

  // 1. Authorization Code Grant (with RFC 7636 PKCE)
  if (grantType === 'authorization_code') {
    const code = req.body?.code
    if (!code) {
      return res.status(400).json({ error: 'invalid_request', error_description: 'Missing authorization code' })
    }

    const session = authSessions.get(code)
    if (!session || session.expiresAt < Date.now()) {
      if (session) authSessions.delete(code)
      return res.status(400).json({
        error: 'invalid_grant',
        error_description: 'Authorization code is invalid or has expired',
      })
    }

    // PKCE verification
    if (session.codeChallenge) {
      const codeVerifier = req.body?.code_verifier
      if (!codeVerifier) {
        return res.status(400).json({
          error: 'invalid_grant',
          error_description: 'PKCE code_verifier is required for this authorization code',
        })
      }

      if (session.codeChallengeMethod === 'S256') {
        const computed = crypto.createHash('sha256').update(codeVerifier).digest('base64url')
        if (computed !== session.codeChallenge) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'PKCE code_verifier verification failed (S256 mismatch)',
          })
        }
      } else if (session.codeChallengeMethod === 'plain') {
        if (codeVerifier !== session.codeChallenge) {
          return res.status(400).json({
            error: 'invalid_grant',
            error_description: 'PKCE code_verifier verification failed (plain mismatch)',
          })
        }
      }
    }

    selectedSub = session.sub
    matchedScope = session.scope || matchedScope

    // Enforce single-use authorization code (RFC 6749 §4.1.2)
    authSessions.delete(code)
  }
  // 2. Pre-Authorized Code Grant (OpenID4VCI Draft 13 §4.1)
  else if (
    grantType === 'urn:ietf:params:oauth:grant-type:pre-authorized_code' ||
    grantType === 'pre-authorized_code'
  ) {
    const preAuthCode = req.body?.['pre-authorized_code'] || req.body?.code
    if (preAuthCode && preAuthRegistry.has(preAuthCode)) {
      selectedSub = preAuthRegistry.get(preAuthCode)!.sub
      preAuthRegistry.delete(preAuthCode)
    }
  }

  const identity: FarmerProfile = FARMER_IDENTITIES[selectedSub] || FARMER_IDENTITIES['2154189532']

  // Access Token payload aligned with Inji Certify CSV Data Provider Plugin
  const accessTokenPayload: Record<string, unknown> = {
    sub: identity.id,
    name: identity.fullName,
    email: `${identity.fullName.toLowerCase().replace(/\\s+/g, '.')}@example.com`,
    phone_number: identity.mobileNumber,
    gender: identity.gender,
    birthdate: identity.dateOfBirth,
    zoneinfo: `${identity.district}, ${identity.state}`,
    scope: matchedScope,
    client_id: clientId,
    c_nonce: cNonce,
    c_nonce_expires_in: 86400,
  }

  // Key-binding confirmation (cnf)
  if (req.body?.wallet_jwk) {
    try {
      accessTokenPayload.cnf = { jwk: JSON.parse(req.body.wallet_jwk) }
    } catch (e) {
      console.error('[oidc] failed to parse wallet_jwk', e)
    }
  }

  const allowedAudiences = [
    'http://certify-nginx:80/v1/certify/issuance/credential',
    'http://localhost:3001/api/local-certify/issuance/credential',
    'http://host.docker.internal:3001/api/local-certify/issuance/credential',
    `${publicBase}/api/local-certify/issuance/credential`,
    `${publicBase}/api/local-certify`,
    clientId,
  ]

  const accessToken = await new jose.SignJWT(accessTokenPayload)
    .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
    .setIssuedAt()
    .setIssuer(oidcBase)
    .setAudience(allowedAudiences)
    .setExpirationTime('1h')
    .sign(privateKey)

  // Standard OIDC ID Token
  const idTokenPayload = {
    sub: identity.id,
    name: identity.fullName,
    email: `${identity.fullName.toLowerCase().replace(/\\s+/g, '.')}@example.com`,
    phone_number: identity.mobileNumber,
    gender: identity.gender,
    birthdate: identity.dateOfBirth,
  }

  const idToken = await new jose.SignJWT(idTokenPayload)
    .setProtectedHeader({ alg: 'ES256', kid: KEY_ID })
    .setIssuedAt()
    .setIssuer(oidcBase)
    .setAudience(clientId)
    .setExpirationTime('1h')
    .sign(privateKey)

  res.json({
    access_token: accessToken,
    token_type: 'Bearer',
    expires_in: 3600,
    scope: matchedScope,
    c_nonce: cNonce,
    c_nonce_expires_in: 86400,
    id_token: idToken,
  })
}

oidcRouter.post('/token', tokenHandler)
oidcRouter.post('/protocol/openid-connect/token', tokenHandler)

// OpenID Connect UserInfo Endpoint
oidcRouter.get('/userinfo', async (req: Request, res: Response) => {
  await ensureKeys()
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'unauthorized', error_description: 'Missing or invalid Bearer token' })
  }

  const token = authHeader.substring(7)
  try {
    const { payload } = await jose.jwtVerify(token, jwk as any, { algorithms: ['ES256'] })
    const sub = String(payload.sub || '2154189532')
    const identity = FARMER_IDENTITIES[sub] || FARMER_IDENTITIES['2154189532']

    res.json({
      sub: identity.id,
      name: identity.fullName,
      email: `${identity.fullName.toLowerCase().replace(/\\s+/g, '.')}@example.com`,
      phone_number: identity.mobileNumber,
      gender: identity.gender,
      birthdate: identity.dateOfBirth,
      address: {
        locality: identity.villageOrTown,
        region: identity.state,
        postal_code: identity.postalCode,
        country: 'India',
      },
      farmer_details: {
        land_area: identity.landArea,
        ownership: identity.landOwnershipType,
        primary_crop: identity.primaryCropType,
        secondary_crop: identity.secondaryCropType,
      },
    })
  } catch {
    return res.status(401).json({ error: 'invalid_token', error_description: 'Token validation failed' })
  }
})
