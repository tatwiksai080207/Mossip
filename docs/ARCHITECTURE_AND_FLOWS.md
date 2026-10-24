# MOSIP Inji Interoperability Playground: Architecture & Protocol Sequence Flows

> **Specification Standards:** OpenID4VCI (draft 13/15), OpenID4VP (draft 21-23 / DCQL v2), W3C VC 1.1 / 2.0 (JSON-LD), IETF SD-JWT VC (`draft-ietf-oauth-sd-jwt-vc`), ISO/IEC 18013-5 mDoc.

This document details the system architecture, component boundaries, and Mermaid protocol sequence flows for the **Inji Interoperability Playground**.

---

## Table of Contents
1. [High-Level System Architecture](#1-high-level-system-architecture)
2. [OpenID4VCI Issuance Protocol Flows](#2-openid4vci-issuance-protocol-flows)
3. [OpenID4VP Presentation & Verification Flows](#3-openid4vp-presentation--verification-flows)
4. [Cross-Ecosystem Interoperability Sequences (Sphereon & walt.id)](#4-cross-ecosystem-interoperability-sequences-sphereon--waltid)
5. [Negative Testing & Replay/Tamper Sequence](#5-negative-testing--replaytamper-sequence)
6. [Mimoto DB Injection & Dynamic PDF Generation](#6-mimoto-db-injection--dynamic-pdf-generation)

---

## 1. High-Level System Architecture

```mermaid
graph TD
    subgraph Client Layer [User Interfaces]
        UI["React 18 + Vite Interop Studio<br/>(Port 3000)"]
        Mobile["Inji Mobile App<br/>(Android / iOS Physical Device)"]
        WebWallet["Inji Web Wallet<br/>(Port 3004)"]
    end

    subgraph BFF Gateway [Express 5 Orchestrator - Port 3001]
        Tunnel["Ngrok / Cloudflare Tunnel Router"]
        Router["Modular BFF API Dispatcher"]
        
        subgraph Modular Controllers
            CertifyRoute["Certify Bridge<br/>/api/local-certify/*"]
            MimotoRoute["Mimoto DB & PDF Bridge<br/>/api/mimoto/*"]
            WalletRoute["Headless Wallet<br/>/api/wallet/*"]
            VerifyRoute["Inji Verify Bridge<br/>/v1/verify/*"]
            TamperRoute["Replay & Tamper Engine<br/>/api/tamper"]
            WaltIdRoute["walt.id Suite<br/>/api/external/waltid/*"]
            SphereonRoute["Sphereon Suite<br/>/api/external/sphereon/*"]
            OIDCRoute["Mock eSignet IdP<br/>/api/oidc/*"]
        end
    end

    subgraph Headless Cryptographic Engines
        LDP["W3C VC 1.1 / 2.0 Engine<br/>(Ed25519Signature2020)"]
        SDJWT["IETF SD-JWT VC Engine<br/>(ES256 + Disclosures + KB-JWT)"]
        MDOC["ISO/IEC 18013-5 mDoc Engine<br/>(CBOR + COSE_Sign1 MSO)"]
        TamperEngine["Deterministic Bitflip &<br/>Timestamp Corruptor"]
    end

    subgraph Upstream MOSIP Stack & Infrastructure
        InjiCertify["Inji Certify (Docker / Collab)<br/>Spring Boot (Port 8090)"]
        InjiVerify["Inji Verify (Docker / Collab)<br/>Spring Boot (Port 8095)"]
        MimotoBFF["Mimoto Backend<br/>(Port 8099)"]
        PG["PostgreSQL Datastore<br/>(inji_mimoto DB - Port 5433)"]
        eSignet["MOSIP eSignet IdP<br/>(Collab Cloud)"]
    end

    subgraph External Reference Engines
        WaltId["walt.id Reference Engine<br/>(OpenID4VCI & OpenID4VP)"]
        Sphereon["Sphereon EUDI Suite<br/>(Issuer, Verifier, Wallet)"]
    end

    UI --> Router
    Mobile -.->|Tunneled QR / Deeplink| Tunnel --> Router
    WebWallet --> MimotoBFF

    Router --> CertifyRoute & MimotoRoute & WalletRoute & VerifyRoute & TamperRoute & WaltIdRoute & SphereonRoute & OIDCRoute

    CertifyRoute --> InjiCertify
    CertifyRoute --> LDP & SDJWT & MDOC
    MimotoRoute --> PG
    WalletRoute --> LDP & SDJWT & MDOC
    VerifyRoute --> InjiVerify
    TamperRoute --> TamperEngine
    WaltIdRoute --> WaltId
    SphereonRoute --> Sphereon
```

---

## 2. OpenID4VCI Issuance Protocol Flows

### 2.1 Automated Pre-Authorized Code Grant Flow (Draft 13/15)

```mermaid
sequenceDiagram
    autonumber
    actor Dev as Developer / CI Suite
    participant Wallet as Headless Wallet Engine
    participant Issuer as OpenID4VCI Mock Issuer
    participant Crypto as Cryptographic Engine

    Dev->>Wallet: POST /api/wallet/issue (format, type)
    Wallet->>Issuer: GET /.well-known/openid-credential-issuer
    Issuer-->>Wallet: 200 OK (Supported formats, endpoints)
    Wallet->>Issuer: GET /api/playground-issuer/credential-offer
    Issuer-->>Wallet: 200 OK (pre-authorized_code, config IDs)
    Wallet->>Issuer: POST /token (grant_type=pre-authorized_code)
    Issuer-->>Wallet: 200 OK (access_token, fresh c_nonce)
    Wallet->>Crypto: Generate Keypair & Sign openid4vci-proof+jwt
    Crypto-->>Wallet: Signed Proof JWT
    Wallet->>Issuer: POST /credential (format, proof.jwt)
    Issuer->>Crypto: Verify proof signature, aud, and c_nonce
    Crypto-->>Issuer: Proof Validated
    Issuer->>Crypto: Sign Verifiable Credential (Ed25519 / ES256)
    Crypto-->>Issuer: Issued Verifiable Credential
    Issuer-->>Wallet: 200 OK (credential payload)
    Wallet-->>Dev: 200 OK (Stored Credential with Metadata)
```

---

### 2.2 Interactive Authorization Code Flow with eSignet Simulation

```mermaid
sequenceDiagram
    autonumber
    actor User as Resident / Tester
    participant UI as Interop Studio UI
    participant OIDC as Mock eSignet IdP
    participant Certify as Inji Certify Bridge

    User->>UI: Select Interactive Issuance & Click "Run Flow"
    UI->>OIDC: GET /api/oidc/authorize (PKCE challenge, scope)
    OIDC-->>UI: 200 OK (Render Consent & Identity Profile Screen)
    User->>UI: Select Persona (e.g. Farmer Gorge Cooper) & Click "Approve Consent"
    UI->>OIDC: POST /api/oidc/consent (consentId, approved: true)
    OIDC-->>UI: 302 Redirect (authorization_code)
    UI->>Certify: POST /token (authorization_code, code_verifier)
    Certify-->>UI: 200 OK (access_token, c_nonce)
    UI->>Certify: POST /credential (proof-of-possession JWT)
    Certify-->>UI: 200 OK (Issued Farmer VC)
    UI-->>User: Display Credential & Highlight Exchanged Wire Payloads
```

---

## 3. OpenID4VP Presentation & Verification Flows

### 3.1 Cross-Device Flow (Physical Inji Mobile Wallet via QR & Tunnel)

```mermaid
sequenceDiagram
    autonumber
    actor Holder as Inji Mobile App (Phone)
    participant RP as Inji Verify / Relying Party
    participant Tunnel as Ngrok Reverse Tunnel Router
    participant UI as Interop Studio UI

    UI->>RP: Request Presentation (DCQL v2 / PEX)
    RP-->>UI: Return Request URI & Nonce
    UI->>UI: Render OpenID4VP QR Code (request_uri pointing to Tunnel)
    Holder->>UI: Scan QR Code with Phone Camera
    Holder->>Tunnel: GET /api/verifier/request/:id
    Tunnel->>RP: Forward request
    RP-->>Holder: 200 OK (Presentation Definition & Nonce)
    Holder->>Holder: User selects credential & signs Presentation Token (VP)
    Holder->>Tunnel: POST /api/verifier/response (direct_post: vp_token)
    Tunnel->>RP: Forward submission
    RP->>RP: Verify cryptographic signature, holder binding & nonce
    RP-->>Holder: 200 OK (Verification Accepted)
    RP-->>UI: WebSocket event: Presentation Verified (Status: PASS)
```

---

## 4. Cross-Ecosystem Interoperability Sequences (Sphereon & walt.id)

### 4.1 Inji Certify $\rightarrow$ Sphereon Wallet $\rightarrow$ Inji Verify

```mermaid
sequenceDiagram
    autonumber
    participant Certify as Inji Certify (MOSIP)
    participant SphWallet as Sphereon Wallet Engine
    participant InjiVerify as Inji Verify (MOSIP)

    Note over Certify,SphWallet: Phase 1: Cross-Ecosystem Issuance
    Certify->>SphWallet: Dispatch OpenID4VCI draft-13 Credential Offer
    SphWallet->>Certify: Token Request (pre-authorized_code)
    Certify-->>SphWallet: access_token & c_nonce
    SphWallet->>Certify: POST /credential with Sphereon did:key proof
    Certify-->>SphWallet: 200 OK (W3C VC 1.1 JSON-LD issued by MOSIP)

    Note over SphWallet,InjiVerify: Phase 2: Cross-Ecosystem Verification
    InjiVerify->>SphWallet: OpenID4VP Auth Request with challenge nonce
    SphWallet->>SphWallet: Craft Verifiable Presentation with holder proof
    SphWallet->>InjiVerify: POST /v1/verify/credentials (vp_token)
    InjiVerify->>InjiVerify: Validate Ed25519Signature2020 & holder did:key
    InjiVerify-->>SphWallet: 200 OK (allChecksSuccessful: true)
```

---

## 5. Negative Testing & Replay/Tamper Sequence

```mermaid
sequenceDiagram
    autonumber
    participant Runner as Test Runner / UI
    participant Tamper as Replay & Tamper Engine
    participant Verifier as Inji Verify / Sphereon Verifier

    Runner->>Runner: Generate Valid Verifiable Presentation (VP)
    Runner->>Tamper: POST /api/tamper (mode: CORRUPT_SIGNATURE, vpToken)
    Tamper->>Tamper: Invert bytes in cryptographic signature segment
    Tamper-->>Runner: 200 OK (mutatedVpToken)
    Runner->>Verifier: POST /v2/vc-verification (mutatedVpToken)
    Verifier->>Verifier: Cryptographic check fails (signature mismatch)
    Verifier-->>Runner: HTTP 200 OK (allChecksSuccessful: false, error: ERR_SIGNATURE_VERIFICATION_FAILED)
    Runner->>Runner: Confirm negative path rejection (Negative Test Status: PASS)
```

---

## 6. Mimoto DB Injection & Dynamic PDF Generation

```mermaid
sequenceDiagram
    autonumber
    participant UI as Interop Studio UI
    participant BFF as Playground BFF Router
    participant PG as PostgreSQL (inji_mimoto DB)
    participant PDF as Dynamic PDF Engine
    participant InjiWeb as Inji Web Wallet (Port 3004)

    UI->>BFF: POST /api/mimoto/credentials (credential payload)
    BFF->>PG: INSERT INTO mimoto_credentials (id, claims, format)
    PG-->>BFF: Query OK (Row Created)
    BFF-->>UI: 200 OK (Credential Injected)
    InjiWeb->>PG: Fetch user credentials
    PG-->>InjiWeb: Return Injected Credential (Instant Appearance)
    UI->>PDF: GET /api/mimoto/credentials/:id/pdf
    PDF->>PDF: Render high-resolution certificate with embedded offline QR
    PDF-->>UI: 200 OK (Binary PDF stream)
```
