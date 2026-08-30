# Interoperability Gap Report

**Inji Interoperability Playground** — Findings from testing the MOSIP Inji credentialing stack across the Collab sandbox environment.

---

## Gap 1: No Pre-Authorized Code Grant on the Mock Issuer

**Severity**: Blocking  
**Component**: Inji Certify (Mock Identity) — `injicertify-mock.collab.mosip.net`  
**Protocol**: OpenID4VCI  

### Description

The Collab sandbox mock issuer (`injicertify-mock.collab.mosip.net`) only supports the **Authorization Code** grant type for credential issuance. The OpenID4VCI specification defines a `urn:ietf:params:oauth:grant-type:pre-authorized_code` grant that allows issuance without interactive user authentication — this is not available.

### Impact

Any automated or headless integration (CI testing, playground BFF, API tests) **cannot issue a credential** because:

1. The credential endpoint (`/v1/certify/issuance/credential`) returns **HTTP 403** without a valid OAuth access token.
2. Obtaining an access token requires completing the full eSignet OAuth flow.
3. The eSignet OAuth flow requires a **dynamic OTP** sent to a registered email address — this cannot be automated without access to the mailbox.

### Evidence

```
POST /v1/certify/issuance/credential → HTTP 403 Forbidden
{
  "timestamp": 1787847010758,
  "status": 403,
  "error": "Forbidden",
  "path": "/v1/certify/issuance/credential"
}
```

All prerequisite steps succeed:
- Keypair generation (EdDSA)
- Metadata discovery
- Nonce retrieval (`c_nonce` from `/v1/certify/nonce`)
- JWT proof-of-possession construction
- Credential issuance (requires OAuth token) [FAILED]

### Recommendation

Provide a `pre-authorized_code` grant on the mock issuer for testing purposes, or expose a test-mode endpoint that accepts credentials with only a valid JWT proof (nonce-based) without requiring a full OAuth token.

---

## Gap 2: CORS Restrictions on Inji Verify API

**Severity**: Significant  
**Component**: Inji Verify — `api.collab.mosip.net`  
**Protocol**: OpenID4VP  

### Description

The Inji Verify API (`api.collab.mosip.net/v1/verify/*`) does not include permissive CORS headers in its responses. Browser-based applications (like this playground, or Inji Web) cannot directly call the verification API from frontend JavaScript.

### Impact

- The `@mosip/react-inji-verify-sdk` fails with `TypeError: Failed to fetch` when configured to point at the Collab sandbox directly.
- Any web-based verifier implementation must route all traffic through a backend proxy, adding infrastructure complexity.

### Workaround Applied

We built a BFF proxy (`server/index.ts`) that forwards `/api/verifier/*` requests to `api.collab.mosip.net` with proper CORS headers on the response.

### Recommendation

Add `Access-Control-Allow-Origin: *` (or a configurable allowlist) to the Inji Verify API responses, at least for the Collab sandbox environment.

---

## Gap 3: `@mosip/react-inji-verify-sdk` Requires React 18

**Severity**: Significant  
**Component**: `@mosip/react-inji-verify-sdk@0.17.0-beta.13`  
**Protocol**: N/A (SDK compatibility)  

### Description

The Inji Verify React SDK bundles its own copy of React internals and references `ReactCurrentOwner`, an internal API that was removed/restructured in React 19. When used in a React 19 application, the SDK crashes with:

```
TypeError: Cannot read properties of undefined (reading 'ReactCurrentOwner')
    at 1020 (@mosip/react-inji-verify-sdk/dist/index.js:2:5072)
```

### Impact

Any project using React 19 (the current latest stable version) cannot integrate the Inji Verify SDK without downgrading.

### Workaround Applied

We downgraded our project from React 19 to React 18 (`react@18`, `react-dom@18`).

### Recommendation

Update the SDK to use `peerDependencies` for React rather than bundling React internals, and test against React 19.

---

## Gap 4: eSignet Mock Requires Dynamic OTP

**Severity**: Significant  
**Component**: eSignet Mock — `esignet-mock.collab.mosip.net`  
**Protocol**: OAuth 2.0 / OIDC  

### Description

The eSignet mock service requires a real dynamic OTP for authentication. Unlike typical test environments that accept static test credentials (e.g., `111111` as OTP), the Collab sandbox sends an actual OTP to the registered email address.

### Impact

- Automated testing is not possible without email inbox access
- Playground demos require manual interaction with eSignet
- CI/CD integration tests cannot run unattended

### Recommendation

Provide a static test OTP mode for the mock eSignet, or expose a `/test/authenticate` endpoint that bypasses OTP verification in the Collab sandbox.

---

## Gap 5: Credential Offer Endpoint Not Discoverable

**Severity**: Minor  
**Component**: Inji Certify (Mock) — OpenID4VCI  
**Protocol**: OpenID4VCI  

### Description

The issuer metadata (`.well-known/openid-credential-issuer`) does not include a `credential_offer_endpoint` or equivalent. The OpenID4VCI specification allows issuers to expose an endpoint for programmatic credential offer creation, but the Collab mock issuer does not provide one.

### Impact

Playground applications must construct credential offers manually from metadata rather than requesting them from the issuer, reducing protocol fidelity.

---

## Summary Matrix

| Gap | Component | Severity | Workaround Available |
|-----|-----------|----------|---------------------|
| No pre-authorized code grant | Inji Certify Mock | Blocking | None (requires manual OAuth) |
| CORS on verify API | Inji Verify | Significant | BFF proxy |
| SDK requires React 18 | react-inji-verify-sdk | Significant | Downgrade React |
| Dynamic OTP on eSignet | eSignet Mock | Significant | None (requires email access) |
| No credential offer endpoint | Inji Certify Mock | Minor | Manual construction |

---

## Testing Environment

- **Sandbox**: MOSIP Collab Environment (August 2026)
- **Browser**: Chrome/Edge (latest)
- **Node.js**: v24
- **React**: 18.x (downgraded from 19.x)
- **SDK**: `@mosip/react-inji-verify-sdk@0.17.0-beta.13`
