# MOSIP Inji Interoperability Playground: API Documentation

> **Specification Standards:** OpenID4VCI (draft 13/15), OpenID4VP (draft 21-23 / DCQL v2), W3C VC 1.1 / 2.0 (JSON-LD), IETF SD-JWT VC (`draft-ietf-oauth-sd-jwt-vc-07`), ISO/IEC 18013-5 mDoc.  
> **Server Baseline:** Node.js/Express BFF on `http://localhost:3001` (or dynamic public Ngrok tunnel for mobile wallet interop).

---

## Table of Contents
1. [Architecture & Base Endpoints](#1-architecture--base-endpoints)
2. [Authentication & Cryptographic Schemes](#2-authentication--cryptographic-schemes)
3. [OpenID4VCI Mock Issuer APIs](#3-openid4vci-mock-issuer-apis)
4. [Inji Certify Bridge APIs](#4-inji-certify-bridge-apis)
5. [Headless Wallet Engine APIs](#5-headless-wallet-engine-apis)
6. [Mimoto BFF Bridge & Credential Injector](#6-mimoto-bff-bridge--credential-injector)
7. [Inji Verify & Relying Party APIs](#7-inji-verify--relying-party-apis)
8. [Replay & Tamper Engine APIs](#8-replay--tamper-engine-apis)
9. [External Reference Implementation (walt.id) APIs](#9-external-reference-implementation-waltid-apis)
10. [Observability & Tunnel Management APIs](#10-observability--tunnel-management-apis)

---

## 1. Architecture & Base Endpoints

The Inji Interoperability Playground Backend-For-Frontend (BFF) operates as an orchestrator, proxy, and protocol translator. It provides:
- Live proxying to local containerized MOSIP services (Certify, Mimoto, Verify).
- Fallback headless cryptographic engines when local Docker or Collab sandboxes are unreachable or require unsupported grant types.
- Protocol bridges that translate between Inji mobile/web formats and external open standards.

### Base URLs
* **Local BFF Server:** `http://localhost:3001`
* **Vite Web UI:** `http://localhost:3000`
* **Public Tunneled URL:** `https://<subdomain>.ngrok-free.dev` (Configured via `/api/tunnel` for physical Android/iOS Inji Wallet testing)

---

## 2. Authentication & Cryptographic Schemes

The APIs support multiple authentication and proof schemes depending on the protocol step:
1. **OpenID4VCI Proof-of-Possession (`openid4vci-proof+jwt`)**:
   - Sent in the `proof.jwt` property of the credential request.
   - Header: `alg: "ES256"` or `"EdDSA"`, `typ: "openid4vci-proof+jwt"`, `jwk` containing the holder's public key.
   - Payload: `iss: <holder_did>`, `aud: <issuer_url>`, `nonce: <c_nonce>`, `iat: <timestamp>`.
2. **Pre-Authorized Code Grant**:
   - Transacted via `grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code`.
   - Bypasses interactive user redirect/eSignet for automated CI interoperability testing.
3. **OpenID4VP DCQL / Presentation Exchange**:
   - Presentation tokens signed by the holder DID (`Ed25519Signature2020` or SD-JWT `kb+jwt`) verifying against the relying party's challenge nonce.

---

## 3. OpenID4VCI Mock Issuer APIs

The playground embeds a fully conformant, headless OpenID4VCI (draft 13) issuer supporting instant issuance of W3C VC 1.1/2.0, SD-JWT VC, and ISO 18013-5 mDoc.

### 3.1 Issuer Metadata Discovery
* **Endpoint:** `GET /.well-known/openid-credential-issuer`
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
curl -X GET http://localhost:3001/.well-known/openid-credential-issuer
```

---

### 3.2 Authorization Server Metadata Discovery
* **Endpoint:** `GET /.well-known/oauth-authorization-server`
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
      "pre-authorized_code": "poc-c7e19984-7a1a-4933-8a03-75b22b7244ee",
      "user_pin_required": false
    }
  }
}
```

---

### 3.4 Token Exchange
* **Endpoint:** `POST /api/playground-issuer/token`
* **Summary:** Exchanges a pre-authorized code for an ephemeral OAuth 2.0 bearer access token and a fresh `c_nonce`.
* **Headers:** `Content-Type: application/x-www-form-urlencoded`
* **Request Body:**
```text
grant_type=urn:ietf:params:oauth:grant-type:pre-authorized_code&pre-authorized_code=poc-c7e19984-7a1a-4933-8a03-75b22b7244ee
```
* **Response (HTTP 200 OK):**
```json
{
  "access_token": "at-93fbcd14b8a4f0bb4e3c9",
  "token_type": "Bearer",
  "expires_in": 3600,
  "c_nonce": "cnonce-26b20c904fa191b9",
  "c_nonce_expires_in": 3600
}
```

---

### 3.5 Credential Request & Issuance
* **Endpoint:** `POST /api/playground-issuer/credential`
* **Summary:** Validates holder proof-of-possession JWT, cryptographically signs the requested credential, and returns the payload.
* **Headers:**
  * `Authorization: Bearer at-93fbcd14b8a4f0bb4e3c9`
  * `Content-Type: application/json`
* **Request Body (JSON-LD):**
```json
{
  "credential_configuration_id": "PlaygroundIdentityCredential",
  "proof": {
    "proof_type": "jwt",
    "jwt": "eyJhbGciOiJFUzI1NiIsInR5cCI6Im9wZW5pZDR2Y2ktcHJvb2YrandrIiw..."
  }
}
```
* **Response (HTTP 200 OK):**
```json
{
  "format": "ldp_vc",
  "credential": {
    "@context": [
      "https://www.w3.org/2018/credentials/v1",
      "https://inji.mosip.io/contexts/identity-v1.jsonld"
    ],
    "id": "urn:uuid:6ca84294-82a1-43ee-bc6b-c74149dd77e2",
    "type": ["VerifiableCredential", "PlaygroundIdentityCredential"],
    "issuer": "did:key:z6Mkk7yqnWbK2Gf5jF8N1vQ...",
    "issuanceDate": "2026-10-22T06:45:00Z",
    "credentialSubject": {
      "id": "did:key:z6MkpTHR8VNsBxYAAWHu...",
      "fullName": "Molleti Tatwik Sai",
      "dateOfBirth": "1995-08-15",
      "gender": "Male",
      "uin": "6207495860"
    },
    "proof": {
      "type": "Ed25519Signature2020",
      "created": "2026-10-22T06:45:00Z",
      "verificationMethod": "did:key:z6Mkk7yqnWbK2Gf5jF8N1vQ...#key-0",
      "proofPurpose": "assertionMethod",
      "proofValue": "z2eQ9yV63wB8F5..."
    }
  },
  "c_nonce": "cnonce-89d04bc7a61d",
  "c_nonce_expires_in": 3600
}
```

---

## 4. Inji Certify Bridge APIs

The playground routes issuance requests to Inji Certify (either local Docker on port 8090/8091 or MOSIP Collab Cloud).

### 4.1 Get Supported Credential Types
* **Endpoint:** `GET /api/local-certify/credential-types`
* **Summary:** Returns the list of credential schemas registered in Inji Certify (`FarmerCredential`, `NationalID`, `DrivingLicenseCredential`, `InsurancePolicy`).
* **Response (HTTP 200 OK):**
```json
{
  "credentialTypes": [
    {
      "id": "FarmerCredential",
      "name": "Farmer ID Credential",
      "format": "ldp_vc",
      "schemaUrl": "https://certify.collab.mosip.net/schemas/farmer.json"
    },
    {
      "id": "FarmerCredential_SD_JWT",
      "name": "Farmer ID (SD-JWT VC)",
      "format": "vc+sd-jwt"
    },
    {
      "id": "DrivingLicenseCredential",
      "name": "Driving License (ISO 18013-5 mDoc)",
      "format": "mso_mdoc"
    }
  ]
}
```

---

### 4.2 Certify Credential Issuance
* **Endpoint:** `POST /api/local-certify/credential`
* **Summary:** Bridges OpenID4VCI requests to Certify. When Certify operates behind private Docker networks, the bridge handles internal `aud` claim injection and returns format-compliant VCs.
* **Request Body:**
```json
{
  "credential_configuration_id": "FarmerCredential_SD_JWT",
  "format": "vc+sd-jwt",
  "vct": "https://inji.mosip.io/credentials/farmer-identity",
  "proof": {
    "proof_type": "jwt",
    "jwt": "<holder_proof_jwt>"
  }
}
```
* **Response (HTTP 200 OK):**
```json
{
  "format": "vc+sd-jwt",
  "credential": "<issuer_jwt>~<disclosure_1>~<disclosure_2>~",
  "c_nonce": "cnonce-99aa77bb22cc",
  "c_nonce_expires_in": 3600
}
```

---

## 5. Headless Wallet Engine APIs

Provides a mock holder engine that automates OpenID4VCI credential acquisition and OpenID4VP verifiable presentation generation.

### 5.1 Query Wallet Keys
* **Endpoint:** `GET /api/wallet/keys`
* **Summary:** Returns the cryptographic keypairs currently maintained by the headless wallet.
* **Response (HTTP 200 OK):**
```json
{
  "issuanceKey": {
    "algorithm": "ES256",
    "curve": "P-256",
    "did": "did:key:zDnaerDaXzoQ9y...",
    "publicJwk": { "kty": "EC", "crv": "P-256", "x": "...", "y": "..." }
  },
  "presentationKey": {
    "algorithm": "Ed25519",
    "did": "did:key:z6Mkk7yqnWbK2Gf5jF8N1vQ...",
    "verificationMethod": "did:key:z6Mkk7yqnWbK2Gf5jF8N1vQ...#key-0"
  }
}
```

---

### 5.2 List Held Credentials
* **Endpoint:** `GET /api/wallet/credentials`
* **Summary:** Returns all credentials stored in the local wallet memory cache.
* **Response (HTTP 200 OK):**
```json
{
  "count": 2,
  "credentials": [
    {
      "id": "cred-1",
      "format": "ldp_vc",
      "type": "PlaygroundIdentityCredential",
      "issuer": "did:key:z6Mkk...",
      "issuanceDate": "2026-10-22T06:45:00Z",
      "claims": {
        "fullName": "Molleti Tatwik Sai",
        "uin": "6207495860"
      }
    }
  ]
}
```

---

### 5.3 Automated Issuance Walk
* **Endpoint:** `POST /api/wallet/issuance/walk`
* **Summary:** Executes the full 7-step OpenID4VCI exchange autonomously against a target issuer (metadata discovery $\rightarrow$ token $\rightarrow$ proof generation $\rightarrow$ credential fetching).
* **Request Body:**
```json
{
  "issuerUrl": "http://localhost:3001/api/playground-issuer",
  "format": "ldp_vc",
  "dataModel": "1.1"
}
```
* **Response (HTTP 200 OK):**
```json
{
  "success": true,
  "stepsExecuted": 7,
  "timeline": [
    { "step": "DISCOVERY", "status": "SUCCESS", "latencyMs": 14 },
    { "step": "OFFER", "status": "SUCCESS", "latencyMs": 6 },
    { "step": "TOKEN", "status": "SUCCESS", "latencyMs": 12 },
    { "step": "PROOF_CREATION", "status": "SUCCESS", "latencyMs": 28 },
    { "step": "CREDENTIAL", "status": "SUCCESS", "latencyMs": 45 }
  ],
  "credentialId": "cred-771"
}
```

---

### 5.4 Create Verifiable Presentation
* **Endpoint:** `POST /api/wallet/present`
* **Summary:** Generates a signed `vp_token` from stored credentials answering a specific verifier challenge/nonce and audience.
* **Request Body:**
```json
{
  "credentialId": "cred-771",
  "nonce": "verifier-nonce-882233",
  "audience": "https://injiverify.collab.mosip.net",
  "selectedDisclosures": ["fullName", "uin"]
}
```
* **Response (HTTP 200 OK):**
```json
{
  "format": "ldp_vp",
  "vp_token": {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    "type": ["VerifiablePresentation"],
    "verifiableCredential": ["<credential_object>"],
    "proof": {
      "type": "Ed25519Signature2020",
      "challenge": "verifier-nonce-882233",
      "domain": "injiverify.collab.mosip.net",
      "proofValue": "z39fbc88a7..."
    }
  }
}
```

---

## 6. Mimoto BFF Bridge & Credential Injector

Bridges credentials generated inside the playground into Mimoto's PostgreSQL database for immediate viewing in **Inji Web** and physical **Inji Mobile** applications.

### 6.1 Inject Credential into Inji Mimoto DB
* **Endpoint:** `POST /api/mimoto/credentials/download`
* **Summary:** Directly binds and persists an issued credential into the `inji_mimoto` database under the active wallet identity.
* **Request Body:**
```json
{
  "walletId": "wallet-user-001",
  "credentialConfigurationId": "FarmerCredential",
  "issuerId": "Farmer",
  "format": "ldp_vc"
}
```
* **Response (HTTP 200 OK):**
```json
{
  "success": true,
  "credentialId": "urn:uuid:71a04d2e-33bb-46ee-8c29-37fbebb01c77",
  "message": "Credential successfully synced to Mimoto PostgreSQL datastore."
}
```

---

### 6.2 Generate Downloadable PDF with Embedded QR
* **Endpoint:** `POST /api/mimoto/download-pdf`
* **Summary:** Compiles verifiable credential claims and a signed QR payload into a styled, printable PDF document.
* **Headers:** `Accept: application/pdf`
* **Response:** Binary PDF stream (`Content-Type: application/pdf`).

---

## 7. Inji Verify & Relying Party APIs

### 7.1 Verify Credential or Presentation
* **Endpoint:** `POST /v1/verify/v2/vc-verification`
* **Summary:** Submits a credential or VP to Inji Verify (or the local cryptographic verification engine) to validate digital signature, expiration, status list, and schema conformity.
* **Request Body:**
```json
{
  "verifiableCredential": "<json_ld_or_sdjwt_string>",
  "includeClaims": true,
  "skipStatusChecks": true
}
```
* **Response (HTTP 200 OK - Valid):**
```json
{
  "allChecksSuccessful": true,
  "schemaAndSignatureCheck": {
    "valid": true,
    "proofType": "Ed25519Signature2020"
  },
  "expirationCheck": {
    "valid": true,
    "expired": false
  },
  "claims": {
    "fullName": "Molleti Tatwik Sai",
    "uin": "6207495860"
  }
}
```
* **Response (HTTP 200 OK - Corrupted Signature):**
```json
{
  "allChecksSuccessful": false,
  "schemaAndSignatureCheck": {
    "valid": false,
    "error": {
      "errorCode": "ERR_SIGNATURE_VERIFICATION_FAILED",
      "errorMessage": "Cryptographic signature does not match verification method public key."
    }
  }
}
```

---

### 7.2 OpenID4VP DCQL Query Generator
* **Endpoint:** `POST /api/verify/dcql-query`
* **Summary:** Generates an OpenID4VP Digital Credential Query Language (DCQL v2) authorization request containing `client_id`, `response_uri`, `nonce`, and credential claim queries.
* **Request Body:**
```json
{
  "credentialFormat": "vc+sd-jwt",
  "requestedClaims": ["fullName", "farmerID", "primaryCropType"]
}
```
* **Response (HTTP 200 OK):**
```json
{
  "authorization_endpoint": "openid4vp://",
  "client_id": "https://injiverify.collab.mosip.net",
  "response_uri": "http://localhost:3001/api/verify/response",
  "nonce": "rnd-nonce-48593021",
  "dcql_query": {
    "credentials": [
      {
        "id": "farmer_creds",
        "format": "vc+sd-jwt",
        "meta": { "vct_values": ["https://inji.mosip.io/credentials/farmer-identity"] },
        "claims": [{ "path": ["fullName"] }, { "path": ["farmerID"] }]
      }
    ]
  }
}
```

---

## 8. Replay & Tamper Engine APIs

Provides programmatic corruption vectors to test negative verification paths and fail-safe defenses.

### 8.1 Corrupt Credential / Presentation
* **Endpoint:** `POST /api/tamper`
* **Summary:** Ingests a valid token/credential and applies targeted cryptographic and semantic corruption.
* **Request Body:**
```json
{
  "target": "<signed_credential_or_token>",
  "mode": "CORRUPT_SIGNATURE"
}
```
* **Supported Modes:**
  * `CORRUPT_SIGNATURE`: Mutates signature bytes, invalidating cryptographic verification.
  * `EXPIRE_TIMESTAMP`: Mutates `expirationDate` or `exp` claim to 1 year in the past.
  * `TAMPER_CLAIMS`: Modifies claim values without recalculating signature hash.
  * `AUDIENCE_MISMATCH`: Modifies `aud` claim to an unauthorized verifier URI.
* **Response (HTTP 200 OK):**
```json
{
  "tamperedPayload": "<tampered_result>",
  "modeApplied": "CORRUPT_SIGNATURE",
  "expectedVerifierOutcome": "REJECT_INVALID_SIGNATURE"
}
```

---

## 9. External Reference Implementation (walt.id) APIs

Cross-ecosystem endpoints demonstrating interoperability against non-MOSIP standards implementations.

### 9.1 Fetch walt.id Credential Offer
* **Endpoint:** `GET /api/external/waltid/offer`
* **Summary:** Retrieves an OpenID4VCI draft-13 compliant offer from a standalone walt.id mock issuer.
* **Response (HTTP 200 OK):**
```json
{
  "credential_issuer": "http://localhost:3001/api/external/waltid",
  "credential_configuration_ids": ["WaltIdIdentityCredential"],
  "grants": {
    "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
      "pre-authorized_code": "waltid-grant-992184"
    }
  }
}
```

---

### 9.2 Submit Presentation to walt.id Verifier
* **Endpoint:** `POST /api/external/waltid/verify`
* **Summary:** Submits an Inji-generated W3C VC or SD-JWT VP to walt.id verifier engine.
* **Request Body:**
```json
{
  "vp_token": "<verifiable_presentation>"
}
```
* **Response (HTTP 200 OK):**
```json
{
  "verified": true,
  "ecosystem": "walt.id OpenID4VP Engine",
  "policyResults": {
    "signature": "PASS",
    "holderBinding": "PASS"
  }
}
```

---

## 10. Observability & Tunnel Management APIs

### 10.1 Service Health & Connectivity Diagnostics
* **Endpoint:** `GET /api/health`
* **Summary:** Returns operational status of the playground BFF and active port configurations.
* **Response (HTTP 200 OK):**
```json
{
  "status": "healthy",
  "service": "inji-playground-bff",
  "timestamp": "2026-10-22T06:45:00Z",
  "uptimeSeconds": 2680
}
```

---

### 10.2 Upstream Sandbox Diagnostics Probe
* **Endpoint:** `GET /api/diagnostics`
* **Summary:** Actively probes reachability, latency, and operational health of all upstream MOSIP sandbox dependencies (Certify, Verify, eSignet, Mimoto) and local PostgreSQL datastores.
* **Response (HTTP 200 OK):**
```json
{
  "overallStatus": "HEALTHY",
  "timestamp": "2026-10-22T08:15:38Z",
  "tunnelUrl": "https://populace-viscosity-suitable.ngrok-free.dev",
  "activeEnvironment": "development",
  "checks": [
    {
      "name": "MOSIP Collab Inji Certify",
      "target": "https://injicertify-mock.collab.mosip.net/.well-known/openid-credential-issuer",
      "status": "UP",
      "latencyMs": 1435,
      "note": "HTTP 200 OK"
    },
    {
      "name": "MOSIP Collab Inji Verify",
      "target": "https://injiverify.collab.mosip.net/v1/verify/v2/vc-verification",
      "status": "UP",
      "latencyMs": 923,
      "note": "HTTP 405 Method Not Allowed"
    },
    {
      "name": "Local PostgreSQL Datastore (Mimoto DB)",
      "target": "postgres@localhost:5433/inji_mimoto",
      "status": "UP",
      "latencyMs": 15,
      "note": "Database query (SELECT 1) succeeded"
    }
  ]
}
```

---

### 10.3 Public Ngrok Tunnel Endpoint
* **Endpoint:** `GET /api/tunnel` & `POST /api/tunnel`
* **Summary:** Read or update the public tunnel URL used by Android/iOS Inji Wallet mobile apps to route VCI and VP callbacks to the local playground.
* **GET Response:**
```json
{ "tunnelUrl": "https://populace-viscosity-suitable.ngrok-free.dev" }
```
* **POST Request Body:**
```json
{ "tunnelUrl": "https://new-subdomain.ngrok-free.dev" }
```

---

### 10.4 Standardized RFC 7807 Error Handling
All error responses adhere to the RFC 7807 Problem Details specification:
```json
{
  "type": "https://inji.mosip.io/errors/err-signature-verification-failed",
  "title": "AppError",
  "status": 400,
  "detail": "Cryptographic signature does not match verification method public key.",
  "errorCode": "ERR_SIGNATURE_VERIFICATION_FAILED",
  "instance": "/v1/verify/v2/vc-verification",
  "timestamp": "2026-10-22T08:15:38Z"
}
```
