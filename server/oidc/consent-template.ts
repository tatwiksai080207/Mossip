import type { FarmerProfile } from './profiles'

export interface ConsentTemplateParams {
  clientId: string
  redirectUri: string
  scope: string
  codeChallenge?: string
  codeChallengeMethod?: string
  state?: string
  farmerList: FarmerProfile[]
  defaultFarmer: FarmerProfile
}

export function renderConsentHtml({
  clientId,
  redirectUri,
  scope,
  codeChallenge,
  codeChallengeMethod,
  state,
  farmerList,
  defaultFarmer,
}: ConsentTemplateParams): string {
  return `
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
            PKCE: ${codeChallengeMethod || 'S256'}
          </span>
          <span class="badge badge-client">Client: ${clientId}</span>
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
            client_id: ${JSON.stringify(clientId)},
            redirect_uri: ${JSON.stringify(redirectUri)},
            scope: ${JSON.stringify(scope)},
            code_challenge: ${JSON.stringify(codeChallenge || '')},
            code_challenge_method: ${JSON.stringify(codeChallengeMethod || '')},
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
  `
}
