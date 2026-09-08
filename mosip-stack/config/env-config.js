window._env_ = {
  DEFAULT_LANG: "en",
  DEFAULT_TITLE: "Inji Web",
  DEFAULT_FAVICON: "favicon.ico",
  DEFAULT_THEME: "light",
  MIMOTO_URL: "http://localhost:8099/v1/mimoto",
  GOOGLE_CLIENT_ID: "297624953605-pdbaemggubg5jkp7nabefddp4kcftu9r.apps.googleusercontent.com"
};

// OpenID4VP & OpenID4VCI Smart Guard & Direct Deep-Linking
(function() {
  try {
    function getIsUnlocked() {
      var walletId = localStorage.getItem('walletId');
      var user = localStorage.getItem('user');
      return !!(walletId && user);
    }

    function checkPostLoginRedirect() {
      var redirectTo = sessionStorage.getItem('redirectTo');
      if (redirectTo) {
        try {
          redirectTo = JSON.parse(redirectTo);
        } catch(e) {}
        var curPath = window.location.pathname;
        if (redirectTo && (curPath === '/issuers' || curPath === '/user/home' || curPath === '/user' || curPath === '/user/issuers')) {
          console.log('[InjiAuthGuard] Post-login redirect from ' + curPath + ' to saved target:', redirectTo);
          sessionStorage.removeItem('redirectTo');
          window.location.replace(redirectTo);
          return true;
        }
      }
      return false;
    }

    // Intercept pushState & replaceState so client-side React Router transitions are monitored
    var origPushState = history.pushState;
    history.pushState = function() {
      origPushState.apply(this, arguments);
      checkPostLoginRedirect();
      checkAutoSelect();
    };
    var origReplaceState = history.replaceState;
    history.replaceState = function() {
      origReplaceState.apply(this, arguments);
      checkPostLoginRedirect();
      checkAutoSelect();
    };
    window.addEventListener('popstate', function() {
      checkPostLoginRedirect();
      checkAutoSelect();
    });

    // Intercept XHR responses from Mimoto to catch wallet_locked or 401 on presentation verification,
    // and route mDoc issuance and preview through Playground BFF (port 3001)
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
      this._method = method;
      this._url = url;
      if (url && typeof url === 'string') {
        if (method === 'POST' && url.indexOf('/wallets/') !== -1 && url.indexOf('/credentials') !== -1) {
          url = url.replace('http://localhost:8099', 'http://localhost:3001');
        } else if (method === 'GET' && url.indexOf('/credentials/') !== -1 && url.indexOf('action=') !== -1) {
          url = url.replace('http://localhost:8099', 'http://localhost:3001');
        }
      }
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
      this.addEventListener('load', function() {
        try {
          if (this._url && this._url.indexOf('/presentations') !== -1) {
            var status = this.status;
            var text = this.responseText || '';
            if (status === 401 || (status === 400 && (text.indexOf('wallet_locked') !== -1 || text.indexOf('Invalid Wallet ID') !== -1 || text.indexOf('unauthorized') !== -1))) {
              console.warn('[InjiAuthGuard] Detected locked wallet in presentations API response (' + status + '). Redirecting to unlock:', text);
              var curRoute = window.location.pathname + window.location.search;
              if (curRoute.indexOf('/user/authorize') !== -1) {
                sessionStorage.setItem('redirectTo', JSON.stringify(curRoute));
                sessionStorage.setItem('openIdVpLogin', JSON.stringify('true'));
                var walletId = localStorage.getItem('walletId');
                if (walletId) {
                  window.location.replace('/user/passcode');
                } else {
                  window.location.replace('/');
                }
              }
            }
          }
        } catch (e) {
          console.warn('[InjiAuthGuard] Error in XHR interceptor:', e);
        }
      });
      return origSend.apply(this, arguments);
    };

    var path = window.location.pathname;
    var search = window.location.search || '';
    var params = new URLSearchParams(search);
    var isUnlocked = getIsUnlocked();

    // 1. OpenID4VP Presentation Guard
    if (path === '/user/authorize' || path === '/authorize') {
      if (search && search.length > 1) {
        var targetVpRoute = '/user/authorize' + (search.startsWith('?') ? search : '?' + search);
        sessionStorage.setItem('redirectTo', JSON.stringify(targetVpRoute));
        sessionStorage.setItem('openIdVpLogin', JSON.stringify('true'));
        if (!isUnlocked) {
          console.warn('[InjiAuthGuard] Wallet not unlocked for VP presentation. Redirecting to login:', targetVpRoute);
          window.location.replace('/');
          return;
        }
      }
    }

    // 2. OpenID4VCI Credential Offer / Direct Issuance Handling
    var rawOffer = params.get('credential_offer');
    var directCredId = params.get('credential_id') || params.get('credential');

    if (rawOffer || directCredId) {
      var targetIssuerId = 'Playground';
      var targetCred = directCredId || '';

      if (rawOffer) {
        try {
          var offerObj = JSON.parse(rawOffer);
          var issuerStr = offerObj.credential_issuer || '';
          if (issuerStr.includes('farmer') || issuerStr.includes('Farmer')) {
            targetIssuerId = 'Farmer';
          } else if (issuerStr.includes('mock-mdl') || issuerStr.includes('MockMdl')) {
            targetIssuerId = 'MockMdl';
          } else {
            targetIssuerId = 'Playground';
          }
          if (!targetCred && offerObj.credential_configuration_ids && offerObj.credential_configuration_ids.length > 0) {
            targetCred = offerObj.credential_configuration_ids[0];
          }
        } catch (err) {
          console.warn('[InjiAuthGuard] Failed to parse credential_offer:', err);
        }
      }

      if (targetCred) {
        sessionStorage.setItem('autoDownloadCredential', targetCred);
      }

      // If on root '/' or not yet on the target issuer page
      if (path === '/' || (path.startsWith('/user/issuers') && !path.includes(targetIssuerId))) {
        var targetRoute = '/user/issuers/' + targetIssuerId;
        sessionStorage.setItem('redirectTo', JSON.stringify(targetRoute));
        if (!isUnlocked) {
          console.log('[InjiAuthGuard] Redirecting to login before downloading credential:', targetRoute);
          window.location.replace('/');
          return;
        } else {
          console.log('[InjiAuthGuard] Navigating directly to target issuer:', targetRoute);
          window.location.replace(targetRoute);
          return;
        }
      }
    }

    // Check post-login redirect on initial page load
    if (checkPostLoginRedirect()) {
      return;
    }

    // 3. Auto-Select / Direct Download Trigger on /user/issuers/:issuerId or /issuers/:issuerId
    var pollTimer = null;
    function checkAutoSelect() {
      var currentPath = window.location.pathname;
      if (!currentPath.includes('/issuers/')) return;
      var pendingCred = directCredId || sessionStorage.getItem('autoDownloadCredential');
      if (!pendingCred) return;

      if (pollTimer) clearInterval(pollTimer);
      var attempts = 0;
      var maxAttempts = 60; // poll up to 12s
      pollTimer = setInterval(function() {
        attempts++;
        var container = document.querySelector('[data-testid="Credential-List-Container"]');
        if (container) {
          var card = container.querySelector('[data-testid="' + pendingCred + '"]') ||
                     container.querySelector('[data-testid*="' + pendingCred + '"]');

          if (!card && attempts > 10) {
            var cards = container.querySelectorAll('div[class*="rounded"]');
            for (var i = 0; i < cards.length; i++) {
              if (cards[i].innerText && cards[i].innerText.toLowerCase().includes('playground identity')) {
                card = cards[i];
                break;
              }
            }
            if (!card && cards.length === 1) {
              card = cards[0];
            }
          }

          if (card) {
            clearInterval(pollTimer);
            sessionStorage.removeItem('autoDownloadCredential');
            console.log('[InjiAuthGuard] Directly selecting credential for download:', pendingCred, card);
            
            try {
              card.style.outline = '3px solid #3b82f6';
              card.style.boxShadow = '0 0 15px rgba(59, 130, 246, 0.5)';
              card.style.transition = 'all 0.3s ease-in-out';
            } catch(e) {}

            setTimeout(function() {
              card.click();
            }, 400);
          }
        }

        if (attempts >= maxAttempts) {
          clearInterval(pollTimer);
        }
      }, 200);
    }

    checkAutoSelect();

    // 4. Retry Card Helper on /user/authorize
    setInterval(function() {
      if (window.location.pathname.indexOf('/user/authorize') !== -1) {
        var buttons = document.querySelectorAll('button');
        var retryBtn = null;
        for (var i = 0; i < buttons.length; i++) {
          if (buttons[i].innerText && buttons[i].innerText.trim().toLowerCase() === 'retry') {
            retryBtn = buttons[i];
            break;
          }
        }
        if (retryBtn && !retryBtn._guardAttached) {
          retryBtn._guardAttached = true;
          var hint = document.getElementById('inji-unlock-hint');
          if (!hint && retryBtn.parentElement) {
            hint = document.createElement('div');
            hint.id = 'inji-unlock-hint';
            hint.style.marginTop = '14px';
            hint.style.textAlign = 'center';
            hint.innerHTML = '<a href="/user/passcode" style="color: #ea580c; font-weight: 600; text-decoration: underline; font-size: 14px;">Unlock Wallet with Passcode</a>';
            retryBtn.parentElement.appendChild(hint);
          }
        }
      }
    }, 500);
  } catch (e) {
    console.warn('[InjiAuthGuard] Error in guard:', e);
  }
})();
