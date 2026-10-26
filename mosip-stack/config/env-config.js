window._env_ = {
  DEFAULT_LANG: "en",
  DEFAULT_TITLE: "Inji Web",
  DEFAULT_FAVICON: "favicon.ico",
  DEFAULT_THEME: "light",
  MIMOTO_URL: "http://localhost:3004/v1/mimoto",
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
      if (sessionStorage.getItem('openIdVpDone') === 'true') {
        sessionStorage.removeItem('redirectTo');
        sessionStorage.removeItem('openIdVpDone');
        sessionStorage.removeItem('openIdVpLogin');
        console.log('[InjiAuthGuard] openIdVpDone detected in checkPostLoginRedirect, redirecting to http://localhost:3000');
        window.location.replace('http://localhost:3000');
        return true;
      }
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
      if (sessionStorage.getItem('openIdVpDone') === 'true') {
        sessionStorage.removeItem('redirectTo');
        sessionStorage.removeItem('openIdVpDone');
        sessionStorage.removeItem('openIdVpLogin');
        console.log('[InjiAuthGuard] openIdVpDone detected in pushState, redirecting to http://localhost:3000');
        window.location.replace('http://localhost:3000');
        return;
      }
      checkPostLoginRedirect();
      checkAutoSelect();
    };
    var origReplaceState = history.replaceState;
    history.replaceState = function() {
      origReplaceState.apply(this, arguments);
      if (sessionStorage.getItem('openIdVpDone') === 'true') {
        sessionStorage.removeItem('redirectTo');
        sessionStorage.removeItem('openIdVpDone');
        sessionStorage.removeItem('openIdVpLogin');
        console.log('[InjiAuthGuard] openIdVpDone detected in replaceState, redirecting to http://localhost:3000');
        window.location.replace('http://localhost:3000');
        return;
      }
      checkPostLoginRedirect();
      checkAutoSelect();
    };
    window.addEventListener('popstate', function() {
      checkPostLoginRedirect();
      checkAutoSelect();
    });

    // Intercept window.open so authorization URLs pointing to internal Docker hostnames are rewritten to localhost
    var origWindowOpen = window.open;
    window.open = function(url, target, features) {
      if (typeof url === 'string') {
        url = url.replace(/host\.docker\.internal/g, 'localhost')
                 .replace(/inji-playground:3001/g, 'localhost:3001')
                 .replace(/inji-playground/g, 'localhost');
      }
      return origWindowOpen.call(this, url, target, features);
    };

    // Intercept XMLHttpRequest response & responseText to rewrite internal Docker hostnames for Axios
    var origResponseTextDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'responseText');
    var origResponseDesc = Object.getOwnPropertyDescriptor(XMLHttpRequest.prototype, 'response');
    if (origResponseTextDesc && origResponseTextDesc.get) {
      Object.defineProperty(XMLHttpRequest.prototype, 'responseText', {
        get: function() {
          var val = origResponseTextDesc.get.call(this);
          if (typeof val === 'string' && (val.includes('host.docker.internal') || val.includes('inji-playground'))) {
            return val.replace(/host\.docker\.internal/g, 'localhost')
                      .replace(/inji-playground:3001/g, 'localhost:3001')
                      .replace(/inji-playground/g, 'localhost');
          }
          return val;
        },
        configurable: true
      });
    }
    if (origResponseDesc && origResponseDesc.get) {
      Object.defineProperty(XMLHttpRequest.prototype, 'response', {
        get: function() {
          var val = origResponseDesc.get.call(this);
          if (typeof val === 'string' && (val.includes('host.docker.internal') || val.includes('inji-playground'))) {
            return val.replace(/host\.docker\.internal/g, 'localhost')
                      .replace(/inji-playground:3001/g, 'localhost:3001')
                      .replace(/inji-playground/g, 'localhost');
          }
          return val;
        },
        configurable: true
      });
    }

    // Intercept XHR responses from Mimoto to catch wallet_locked or 401 on presentation verification,
    // and route mDoc issuance and preview through Playground BFF (port 3001)
    var origOpen = XMLHttpRequest.prototype.open;
    var origSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function(method, url) {
      this._method = method;
      this._url = url;
      if (url && typeof url === 'string') {
        if ((method === 'POST' || method === 'PATCH') && url.indexOf('/wallets/') !== -1 && (url.indexOf('/credentials') !== -1 || url.indexOf('/presentations') !== -1)) {
          url = url.replace('http://localhost:3004', 'http://localhost:3001').replace('http://localhost:8099', 'http://localhost:3001');
          if (url.startsWith('/v1/mimoto')) url = 'http://localhost:3001' + url;
        } else if (method === 'GET' && url.indexOf('/wallets/') !== -1 && (url.indexOf('/credentials') !== -1 || url.indexOf('/presentations') !== -1)) {
          url = url.replace('http://localhost:3004', 'http://localhost:3001').replace('http://localhost:8099', 'http://localhost:3001');
          if (url.startsWith('/v1/mimoto')) url = 'http://localhost:3001' + url;
        } else if (url.indexOf('/v2/issuers') !== -1) {
          url = url.replace('/v2/issuers', '/issuers');
        }
        url = url.replace('host.docker.internal', 'localhost');
        url = url.replace('certify-nginx', 'localhost:8091');
        arguments[1] = url;
      }
      return origOpen.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function() {
      try {
        this.setRequestHeader('Accept-Language', 'en');
      } catch(e) {}
      
      // When Inji Web sends an OpenID4VP presentation verification request to Mimoto,
      // Mimoto (running inside Docker) needs to fetch request_uri from host.docker.internal:3001,
      // NOT localhost:3001 which refuses connection inside the container.
      if (arguments[0] && typeof arguments[0] === 'string' && this._url && this._url.indexOf('/presentations') !== -1) {
        arguments[0] = arguments[0].replace(/localhost%3A3001/g, 'host.docker.internal%3A3001')
                                   .replace(/127\.0\.0\.1%3A3001/g, 'host.docker.internal%3A3001')
                                   .replace(/localhost:3001/g, 'host.docker.internal:3001')
                                   .replace(/127\.0\.0\.1:3001/g, 'host.docker.internal:3001');
      }

      this.addEventListener('load', function() {
        try {
          if (this._url && this._url.indexOf('/presentations') !== -1) {
            var status = this.status;
            var text = this.responseText || '';
            if (status === 200) {
              sessionStorage.setItem('openIdVpDone', 'true');
              sessionStorage.removeItem('redirectTo');
              sessionStorage.removeItem('openIdVpLogin');
            }
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

    var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
    XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
      if (header.toLowerCase() === 'accept-language') {
        value = 'en'; // Force 2-letter ISO code for Mimoto
      }
      return origSetHeader.call(this, header, value);
    };
    
    var origFetch = window.fetch;
    window.fetch = function() {
      let url = '';
      let isRequestObj = false;
      if (arguments[0] && typeof arguments[0] === 'string') {
        url = arguments[0];
      } else if (arguments[0] && typeof arguments[0] === 'object' && arguments[0].url) {
        url = arguments[0].url;
        isRequestObj = true;
      }
      
      // Enforce Accept-Language for fetch API
      var config = arguments[1] || {};
      if (config.headers instanceof Headers) {
        config.headers.set('Accept-Language', 'en');
      } else if (config.headers) {
        config.headers['Accept-Language'] = 'en';
      }

      if (config && config.body && typeof config.body === 'string' && url.indexOf('/presentations') !== -1) {
        config.body = config.body.replace(/localhost%3A3001/g, 'host.docker.internal%3A3001')
                                 .replace(/127\.0\.0\.1%3A3001/g, 'host.docker.internal%3A3001')
                                 .replace(/localhost:3001/g, 'host.docker.internal:3001')
                                 .replace(/127\.0\.0\.1:3001/g, 'host.docker.internal:3001');
      }
      arguments[1] = config;
      
      if (url) {
        if (url.indexOf('/wallets/') !== -1 && (url.indexOf('/credentials') !== -1 || url.indexOf('/presentations') !== -1)) {
          url = url.replace('http://localhost:3004', 'http://localhost:3001').replace('http://localhost:8099', 'http://localhost:3001');
          if (url.startsWith('/v1/mimoto')) url = 'http://localhost:3001' + url;
        } else if (url.indexOf('/v2/issuers') !== -1) {
          url = url.replace('/v2/issuers', '/issuers');
        }
        url = url.replace('host.docker.internal', 'localhost');
        url = url.replace('http://certify-nginx', 'http://localhost:3001/api/local-certify');
        
        if (isRequestObj) {
           arguments[0] = new Request(url, arguments[0]);
        } else {
           arguments[0] = url;
        }
      }
      const fetchPromise = origFetch.apply(this, arguments);
      const modifiedPromise = fetchPromise.then(res => {
          if (res.ok) {
              if (url && url.indexOf('/presentations') !== -1) {
                sessionStorage.setItem('openIdVpDone', 'true');
                sessionStorage.removeItem('redirectTo');
                sessionStorage.removeItem('openIdVpLogin');
              }
              // We must replace internal docker hostnames with localhost in the JSON responses (like /v2/issuers)
              // so that Inji Web navigates to localhost for authorization endpoints instead of Docker's internal host.
              return res.clone().text().then(text => {
                  if (text.includes('host.docker.internal') || text.includes('inji-playground')) {
                      text = text.replace(/host\.docker\.internal/g, 'localhost');
                      text = text.replace(/inji-playground:3001/g, 'localhost:3001');
                      text = text.replace(/inji-playground/g, 'localhost');
                      return new Response(text, {
                          status: res.status,
                          statusText: res.statusText,
                          headers: res.headers
                      });
                  }
                  return res;
              });
          }
          if (!res.ok) {
              res.clone().text().then(text => {
                  try {
                      var errors = JSON.parse(localStorage.getItem('__inji_errors') || '[]');
                      errors.push({ url: res.url, status: res.status, body: text, time: new Date().toISOString() });
                      localStorage.setItem('__inji_errors', JSON.stringify(errors));
                  } catch (e) {}
              });
          }
          return res;
      });
      modifiedPromise.catch(err => {
          try {
              var errors = JSON.parse(localStorage.getItem('__inji_errors') || '[]');
              errors.push({ url: arguments[0]?.url || arguments[0], status: 0, error: String(err), time: new Date().toISOString() });
              localStorage.setItem('__inji_errors', JSON.stringify(errors));
          } catch (e) {}
      });
      return modifiedPromise;
    };

    var path = window.location.pathname;
    var search = window.location.search || '';
    var params = new URLSearchParams(search);
    var isUnlocked = getIsUnlocked();

    // 1. OpenID4VP Presentation Guard
    if (path === '/user/authorize' || path === '/authorize') {
      if (sessionStorage.getItem('openIdVpDone') === 'true') {
        console.log('[InjiAuthGuard] Presentation already completed (openIdVpDone), redirecting immediately to http://localhost:3000');
        sessionStorage.removeItem('openIdVpDone');
        sessionStorage.removeItem('redirectTo');
        sessionStorage.removeItem('openIdVpLogin');
        window.location.replace('http://localhost:3000');
        return;
      }
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
    var pathIssuer = path.startsWith('/user/issuers/') ? path.replace('/user/issuers/', '').split('?')[0].split('/')[0] : '';

    if (rawOffer || directCredId || pathIssuer) {
      var targetIssuerId = pathIssuer || 'Playground';
      var targetCred = directCredId || '';

      if (directCredId) {
        var lowerCred = directCredId.toLowerCase();
        if (lowerCred.includes('sphereon') || lowerCred.includes('diploma') || lowerCred.includes('ehic') || lowerCred.includes('eudi')) {
          targetIssuerId = 'Sphereon';
        } else if (lowerCred.includes('waltid')) {
          targetIssuerId = 'WaltId';
        } else if (lowerCred.includes('farmer')) {
          targetIssuerId = 'Farmer';
        } else if (lowerCred.includes('mdoc') || lowerCred.includes('driving')) {
          targetIssuerId = pathIssuer || 'MockMdl';
        }
      }

      if (rawOffer) {
        try {
          var offerObj = JSON.parse(rawOffer);
          var issuerStr = (offerObj.credential_issuer || '').toLowerCase();
          if (issuerStr.includes('sphereon')) {
            targetIssuerId = 'Sphereon';
          } else if (issuerStr.includes('waltid')) {
            targetIssuerId = 'WaltId';
          } else if (issuerStr.includes('farmer') || issuerStr.includes('local-certify')) {
            targetIssuerId = 'Farmer';
          } else if (issuerStr.includes('mock-mdl')) {
            targetIssuerId = 'MockMdl';
          } else if (pathIssuer) {
            targetIssuerId = pathIssuer;
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
    // Auto-redirect and cleanup when presentation success modal is displayed
    setInterval(function() {
      var successCard = document.getElementById('card-share-success') || document.getElementById('icon-success');
      if (successCard && !successCard._redirectAttached) {
        successCard._redirectAttached = true;
        sessionStorage.setItem('openIdVpDone', 'true');
        sessionStorage.removeItem('redirectTo');
        sessionStorage.removeItem('openIdVpLogin');

        // Hook return button immediately
        var returnBtn = successCard.querySelector('[data-testid="btn-return-to-verifier"]') ||
                        successCard.querySelector('button');
        if (returnBtn) {
          returnBtn.addEventListener('click', function(ev) {
            ev.preventDefault();
            ev.stopPropagation();
            console.log('[InjiAuthGuard] User clicked Return to Verifier, navigating to http://localhost:3000');
            window.location.href = 'http://localhost:3000';
          }, true);
        }

        // Automatic countdown redirect fallback after 4 seconds (before React modal timer calls navigate('/'))
        setTimeout(function() {
          console.log('[InjiAuthGuard] Auto-redirecting to verifier playground (http://localhost:3000)...');
          sessionStorage.setItem('openIdVpDone', 'true');
          sessionStorage.removeItem('redirectTo');
          sessionStorage.removeItem('openIdVpLogin');
          window.location.href = 'http://localhost:3000';
        }, 4000);
      }
    }, 200);
  } catch (e) {
    console.warn('[InjiAuthGuard] Error in guard:', e);
  }
})();
