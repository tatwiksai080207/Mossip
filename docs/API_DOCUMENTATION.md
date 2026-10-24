# MOSIP Inji Interoperability Playground: API Documentation

> **Specification Standards:** OpenID4VCI (draft 13/15), OpenID4VP (draft 21-23 / DCQL v2), W3C VC 1.1 / 2.0 (JSON-LD), IETF SD-JWT VC (`draft-ietf-oauth-sd-jwt-vc`), ISO/IEC 18013-5 mDoc.  
> **Server Baseline:** Node.js/Express 5 BFF on `http://localhost:3001` (or dynamic public Ngrok tunnel for mobile wallet interop).  
> **Frontend Client:** React 18 + Vite on `http://localhost:3000`.

---

## Table of Contents
1. [Architecture & Base Endpoints](#1-architecture--base-endpoints)
2. [Authentication & Cryptographic Proof Schemes](#2-authentication--cryptographic-proof-schemes)
3. [OpenID4VCI Playground Mock Issuer APIs](#3-openid4vci-playground-mock-issuer-apis)
4. [Interactive OIDC & eSignet Simulation APIs](#4-interactive-oidc--esignet-simulation-apis)
5. [Inji Certify Bridge APIs](#5-inji-certify-bridge-apis)
6. [Headless Wallet Engine APIs](#6-headless-wallet-engine-apis)
7. [Mimoto BFF Bridge & Credential Injector](#7-mimoto-bff-bridge--credential-injector)
8. [Inji Verify & Relying Party APIs](#8-inji-verify--relying-party-apis)
9. [Replay & Tamper Engine APIs](#9-replay--tamper-engine-apis)
10. [External Reference Implementation: walt.id APIs](#10-external-reference-implementation-waltid-apis)
11. [External Reference Implementation: Sphereon APIs](#11-external-reference-implementation-sphereon-apis)
12. [Observability, Tunnel & Telemetry APIs](#12-observability-tunnel--telemetry-apis)

---

## 1. Architecture & Base Endpoints

The Inji Interoperability Playground Backend-For-Frontend (BFF) operates as an orchestrator, reverse-proxy, protocol translator, and conformance testbed. It provides:
- Live proxying and metadata caching for local containerized MOSIP services (Certify, Mimoto, Verify) and MOSIP Collab Sandbox environments.
- Fully conformant headless cryptographic engines when local Docker or Collab sandboxes require automated non-interactive testing.
- Protocol bridges that translate between Inji mobile/web formats, walt.id, and Sphereon EUDI implementations.
- Deterministic mutation and tampering engine for negative path testing.

### Base URLs
* **Local BFF Server:** `http://localhost:3001`
* **Vite Web UI:** `http://localhost:3000`
* **Public Tunneled URL:** `https://<subdomain>.ngrok-free.dev` (Configured via `/api/tunnel` for physical Android/iOS Inji Wallet testing)

---

## 2. Authentication & Cryptographic Proof Schemes

The APIs support multiple authentication and proof schemes depending on the protocol step:
1. **OpenID4VCI Proof-of-Possession (`openid4vci-proof+jwt`)**:
   - Sent in the `proof.jwt` property of the credential request.
   - Header: `alg: "ES256"` or `"EdDSA"`, `typ: "openid4vci-proof+jwt"`, `jwk` containing the holder's public key.
   - Payload: `iss: <holder_did>`, `aud: <issuer_url>`, `nonce: <c_nonce>`, `iat: <timestamp>`.
2. **Pre-Authorized Code Grant**:
   - Transacted via `grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code`.
   - Bypasses interactive user redirect/eSignet for automated CI interoperability testing.
3. **Interactive OIDC / eSignet Code Flow**:
   - Transacted via standard OAuth 2.0 PKCE (`code_challenge`, `code_challenge_method=S256`) and simulated eSignet consent approval.
4. **OpenID4VP DCQL / Presentation Exchange**:
   - Presentation tokens signed by the holder DID (`Ed25519Signature2020` or SD-JWT `kb+jwt`) verifying against the relying party's challenge nonce.

---

## 3. OpenID4VCI Playground Mock Issuer APIs

The playground embeds a fully conformant, headless OpenID4VCI (draft 13/15) issuer supporting instant issuance of W3C VC 1.1/2.0, SD-JWT VC, and ISO 18013-5 mDoc.

### 3.1 Issuer Metadata Discovery
* **Endpoint:** `GET /.well-known/openid-credential-issuer/api/playground-issuer`
* **Summary:** Advertises supported credential formats, cryptographic suites, display metadata, and token/credential endpoints.
* **Headers:** `Accept: application/json`
* **Response (HTTP 200 OK):**
```json
{
  "credential_issuer": "http://localhost:3001/api/playground-issuer",
  "credential_endpoint": "http://localhost:3001/api/playground-issuer/credential",
  "token_endpoint": "http://localhost:3001/api/playground-issuer/token",
  "nonce_endpoint": "http://localhost:3001/api/playground-issuer/nonce",
  "credentials_supported": {
    "PlaygroundIdentityCredential": {
      "format": "ldp_vc",
      "cryptographic_binding_methods_supported": ["did:key"],
      "credential_signing_alg_values_supported": ["Ed25519Signature2020"],
      "types": ["VerifiableCredential", "PlaygroundIdentityCredential"]
    },
    "PlaygroundSDJWTCredential": {
      "format": "vc+sd-jwt",
      "vct": "https://inji-playground.mosip.dev/credentials/identity",
      "cryptographic_binding_methods_supported": ["jwk", "did:key"],
      "credential_signing_alg_values_supported": ["ES256"]
    },
    "DrivingLicenseCredential": {
      "format": "mso_mdoc",
      "doctype": "org.iso.18013.5.1.mDL",
      "cryptographic_binding_methods_supported": ["cose_key"],
      "credential_signing_alg_values_supported": ["ES256"]
    }
  }
}
```
* **cURL Example:**
```bash
curl -X GET http://localhost:3001/.well-known/openid-credential-issuer/api/playground-issuer
```

---

### 3.2 Authorization Server Metadata Discovery
* **Endpoint:** `GET /.well-known/oauth-authorization-server/api/playground-issuer`
* **Summary:** RFC 8414 metadata advertising supported grant types (`pre-authorized_code`), response types, and token endpoint.
* **Response (HTTP 200 OK):**
```json
{
  "issuer": "http://localhost:3001/api/playground-issuer",
  "token_endpoint": "http://localhost:3001/api/playground-issuer/token",
  "response_types_supported": ["token"],
  "grant_types_supported": [
    "urn:ietf:params:oauth:grant-type:pre-authorized_code"
  ],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

---

### 3.3 Create Credential Offer
* **Endpoint:** `GET /api/playground-issuer/credential-offer`
* **Summary:** Generates an OpenID4VCI draft-13 credential offer containing a pre-authorized grant code and the credential configuration IDs to be claimed.
* **Query Parameters:**
  * `format` (optional, string): `ldp_vc` (default), `vc+sd-jwt`, or `mso_mdoc`.
  * `vcdm` (optional, string): `1.1` or `2.0`.
* **Response (HTTP 200 OK):**
```json
{
  "credential_issuer": "http://localhost:3001/api/playground-issuer",
  "credential_configuration_ids": ["PlaygroundIdentityCredential"],
  "grants": {
    "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
      "pre-authorized_code": "07c3f81e-92c2-482a-bc7a-50f4439c87d4",
      "tx_code": null
    }
  }
}
```

---

### 3.4 Token Endpoint
* **Endpoint:** `POST /api/playground-issuer/token`
* **Summary:** Exchanges a `pre-authorized_code` for a bearer access token and a fresh `c_nonce`.
* **Headers:** `Content-Type: application/x-www-form-urlencoded`
* **Request Body:**
```text
grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code&pre-authorized_code=07c3f81e-92c2-482a-bc7a-50f4439c87d4
```
* **Response (HTTP 200 OK):**
```json
{
  "access_token": "at_2f849b2c34918ef01bc...",
  "token_type": "bearer",
  "expires_in": 3600,
  "c_nonce": "cnonce_8849bf3019d...",
  "c_nonce_expires_in": 3600
}
```

---

### 3.5 Credential Issuance Endpoint
* **Endpoint:** `POST /api/playground-issuer/credential`
* **Summary:** Evaluates proof-of-possession, signs the requested credential format, and returns the issued verifiable credential.
* **Headers:**
  * `Authorization: Bearer <access_token>`
  * `Content-Type: application/json`
* **Request Body (W3C VC JSON-LD):**
```json
{
  "format": "ldp_vc",
  "credential_definition": {
    "type": ["VerifiableCredential", "PlaygroundIdentityCredential"]
  },
  "proof": {
    "proof_type": "jwt",
    "jwt": "eyJhbGciOiJFZERTQSI..."
  }
}
```
* **Response (HTTP 200 OK):**
```json
{
  "credential": {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://w3id.org/security/suites/ed25519-2020/v1"
    ],
    "id": "urn:uuid:7f6a5b82-...",
    "type": ["VerifiableCredential", "PlaygroundIdentityCredential"],
    "issuer": "did:key:z6MkhaXg1NDV25T...",
    "issuanceDate": "2026-10-22T08:15:38Z",
    "credentialSubject": {
      "id": "did:key:z6MkpTHR8VNsBxY...",
      "fullName": "Resident Test User",
      "uin": "1111222233",
      "email": "resident.test@example.org"
    },
    "proof": {
      "type": "Ed25519Signature2020",
      "created": "2026-10-22T08:15:38Z",
      "verificationMethod": "did:key:z6MkhaXg1NDV25T...#z6MkhaXg1NDV25T...",
      "proofPurpose": "assertionMethod",
      "proofValue": "z39A8F..."
    }
  }
}
```

---

## 4. Interactive OIDC & eSignet Simulation APIs

Simulates MOSIP's eSignet Identity Provider, providing an interactive authentication and user consent UI.

### 4.1 Authorize Request
* **Endpoint:** `GET /api/oidc/authorize`
* **Summary:** Initiates OAuth 2.0 PKCE flow. Renders an interactive login screen or redirects to consent.
* **Query Parameters:**
  * `client_id`, `redirect_uri`, `response_type=code`, `scope=openid profile`, `state`, `code_challenge`, `code_challenge_method=S256`.

---

### 4.2 Consent Screen & Approval
* **Endpoint:** `POST /api/oidc/consent`
* **Summary:** Submits user authorization consent for requested scopes and claims.
* **Request Body:**
```json
{
  "consentId": "consent_1849204",
  "approved": true,
  "profileId": "farmer_gorge_cooper",
  "claims": ["name", "email", "farmer_id", "land_area"]
}
```
* **Response (HTTP 302 Found):** Redirects back to `redirect_uri` with `code` and `state`.

---

### 4.3 OIDC Token Exchange
* **Endpoint:** `POST /api/oidc/token`
* **Summary:** Exchanges authorization code and `code_verifier` for `id_token` and `access_token`.

---

### 4.4 UserInfo Endpoint
* **Endpoint:** `GET /api/oidc/userinfo`
* **Headers:** `Authorization: Bearer <access_token>`
* **Response (HTTP 200 OK):**
```json
{
  "sub": "uin_1111222233",
  "name": "Resident Test User",
  "email": "resident.test@example.org",
  "gender": "male",
  "birthdate": "1995-08-15"
}
```

---

## 5. Inji Certify Bridge APIs

Proxies and orchestrates calls to Inji Certify (Docker container on port 8090 or MOSIP Collab Cloud Sandbox).

### 5.1 Certify Discovery Proxy
* **Endpoint:** `GET /api/local-certify/.well-known/openid-credential-issuer`
* **Summary:** Fetches Certify metadata and injects internal audience headers to overcome Docker reverse-proxy host rewriting.

### 5.2 Dynamic Metadata Query
* **Endpoint:** `GET /api/certify/metadata`
* **Query Parameters:** `target` (e.g., `local` or `collab_farmer`)
* **Response (HTTP 200 OK):** Returns normalized issuer metadata, display names, and supported formats.

---

## 6. Headless Wallet Engine APIs

Provides programmatic wallet capabilities to accept offers, store credentials, and sign presentations without manual user interaction.

### 6.1 Issue / Accept Offer
* **Endpoint:** `POST /api/wallet/issue`
* **Summary:** Automatically performs the full OpenID4VCI walk: obtains access token, generates keypair, crafts `openid4vci-proof+jwt`, requests credential, and stores it.
* **Request Body:**
```json
{
  "issuerUrl": "http://localhost:3001/api/playground-issuer",
  "credentialType": "PlaygroundIdentityCredential",
  "format": "ldp_vc",
  "preAuthCode": "07c3f81e-92c2-482a-bc7a-50f4439c87d4"
}
```
* **Response (HTTP 200 OK):**
```json
{
  "status": "SUCCESS",
  "credentialId": "cred_8849b2",
  "format": "ldp_vc",
  "holderDid": "did:key:z6MkpTHR8VNsBxY...",
  "claims": {
    "fullName": "Resident Test User",
    "uin": "1111222233"
  }
}
```

---

### 6.2 List Held Credentials
* **Endpoint:** `GET /api/wallet/credentials`
* **Summary:** Retrieves all credentials currently stored in the headless wallet.

---

### 6.3 Present Credential (OpenID4VP)
* **Endpoint:** `POST /api/wallet/present`
* **Summary:** Crafts a Verifiable Presentation (`vp_token`) bound to the verifier's `nonce` and `audience`.
* **Request Body:**
```json
{
  "credentialId": "cred_8849b2",
  "nonce": "verifier_challenge_9921",
  "audience": "http://localhost:3001/v1/verify"
}
```
* **Response (HTTP 200 OK):**
```json
{
  "vp_token": "{\"@context\":[\"https://www.w3.org/2018/credentials/v1\"],\"type\":[\"VerifiablePresentation\"]...}",
  "holderDid": "did:key:z6MkpTHR8VNsBxY..."
}
```

---

## 7. Mimoto BFF Bridge & Credential Injector

Bridges the playground with Inji Web and Inji Mobile's backend service (Mimoto).

### 7.1 Database Credential Injection
* **Endpoint:** `POST /api/mimoto/credentials`
* **Summary:** Injects credentials directly into Mimoto PostgreSQL database (`inji_mimoto`) so they immediately appear in Inji Web Wallet.

### 7.2 Dynamic Credential PDF Generator
* **Endpoint:** `GET /api/mimoto/credentials/:id/pdf`
* **Summary:** Generates a downloadable, cryptographically watermarked PDF representing the credential, complete with offline QR code.

---

## 8. Inji Verify & Relying Party APIs

Proxies verification requests to Inji Verify (`verify-service:8095` or Collab Sandbox).

### 8.1 W3C VC Verification
* **Endpoint:** `POST /v1/verify/credentials`
* **Summary:** Verifies JSON-LD credentials and presentations using Inji Verify.

### 8.2 Multi-Format Verification (`/v2/vc-verification`)
* **Endpoint:** `POST /v2/vc-verification`
* **Headers:** `Content-Type: application/json`
* **Request Body:**
```json
{
  "verifiableCredentials": ["<credential_string_or_json>"]
}
```
* **Response (HTTP 200 OK):**
```json
{
  "allChecksSuccessful": true,
  "schemaAndSignatureCheck": { "valid": true },
  "expirationCheck": { "valid": true },
  "statusCheck": { "valid": true }
}
```

---

## 9. Replay & Tamper Engine APIs

Enables deterministic mutation of verifiable presentations to demonstrate Inji Verify's error handling.

### 9.1 Apply Tampering Vector
* **Endpoint:** `POST /api/tamper`
* **Request Body:**
```json
{
  "mode": "CORRUPT_SIGNATURE",
  "vpToken": "eyJhbGciOiJFUzI1NiIs..."
}
```
* **Supported Modes:**
  * `NONE`: Unmodified payload.
  * `CORRUPT_SIGNATURE`: Inverts cryptographic bytes in the signature block.
  * `EXPIRED_TIMESTAMP`: Sets `exp` claim to 24 hours in the past.
  * `INVALID_TYPE`: Mutates `@type` to an unknown schema.
* **Response (HTTP 200 OK):**
```json
{
  "tampered": true,
  "mode": "CORRUPT_SIGNATURE",
  "mutatedVpToken": "eyJhbGciOiJFUzI1NiIs...<flipped_bits>"
}
```

---

## 10. External Reference Implementation: walt.id APIs

Bridges with walt.id's open-source OpenID4VCI and OpenID4VP engines.

### 10.1 walt.id Issuance Walk
* **Endpoint:** `POST /api/external/waltid/issue`
* **Summary:** Triggers walt.id OpenID4VCI issuer mock.

### 10.2 walt.id Presentation Verification
* **Endpoint:** `POST /api/external/waltid/verifier/verify`
* **Summary:** Validates a presentation against walt.id's relying party engine.

---

## 11. External Reference Implementation: Sphereon APIs

Matches Sphereon's Identity Development Kit (IDK) and European Digital Identity (EUDI) specifications.

### 11.1 Sphereon Issuer Metadata
* **Endpoint:** `GET /.well-known/openid-credential-issuer/api/external/sphereon/issuer`
* **Summary:** Advertises supported EUDI formats:
  * `sphereon-eudi-pid` (`vc+sd-jwt`)
  * `sphereon-diploma-vcdm20` (`ldp_vc`, W3C VC 2.0)
  * `sphereon-ehic-vcdm11` (`ldp_vc`, W3C VC 1.1)

### 11.2 Sphereon Credential Offer
* **Endpoint:** `GET /api/external/sphereon/issuer/credential-offer`
* **Query Parameters:** `credentialId` (e.g., `sphereon-eudi-pid`)

### 11.3 Sphereon Token & Issuance
* **Endpoint:** `POST /api/external/sphereon/issuer/token`
* **Endpoint:** `POST /api/external/sphereon/issuer/credential`

### 11.4 Sphereon Verifier (OpenID4VP DIF PEX v2)
* **Endpoint:** `POST /api/external/sphereon/verifier/v1/verify/vp-request`
* **Summary:** Creates a verification transaction and DIF Presentation Exchange v2 definition.
* **Response (HTTP 200 OK):**
```json
{
  "transactionId": "txn-sphereon-189283",
  "requestId": "req_sphereon_ab182",
  "requestUri": "http://localhost:3001/api/external/sphereon/verifier/v1/verify/vp-request/req_sphereon_ab182",
  "responseUri": "http://localhost:3001/api/external/sphereon/verifier/v1/verify/vp-submission/direct-post"
}
```

### 11.5 Sphereon Direct Post Submission
* **Endpoint:** `POST /api/external/sphereon/verifier/v1/verify/vp-submission/direct-post`
* **Summary:** Direct post receiver for OpenID4VP presentations.

### 11.6 Sphereon Wallet Acceptance
* **Endpoint:** `POST /api/external/sphereon/wallet/accept-offer`
* **Summary:** Performs automated OpenID4VCI acceptance from Sphereon's independent wallet engine.

---

## 12. Observability, Tunnel & Telemetry APIs

### 12.1 Health Probe
* **Endpoint:** `GET /api/health`

### 12.2 Upstream Sandbox Diagnostics
* **Endpoint:** `GET /api/diagnostics`
* **Summary:** Probes reachability and latency of MOSIP Certify, Verify, eSignet, and local PostgreSQL databases.

### 12.3 Ngrok Tunnel Synchronization
* **Endpoint:** `GET /api/tunnel` & `POST /api/tunnel`
* **Summary:** Coordinates reverse-proxy tunnels for real Android/iOS mobile testing.

### 12.4 Real-time Protocol Telemetry WebSocket
* **Endpoint:** `WS /ws/telemetry`
* **Summary:** Streams live wire protocol events to the frontend sequence diagram and protocol inspector.
