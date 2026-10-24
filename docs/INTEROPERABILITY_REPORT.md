# Verifiable Credentials Interoperability Playground: Interoperability Evaluation Report

> **Hackathon Reference:** MOSIP Decode 2026 — Problem Statement 02: *Build an Interoperability Playground for Verifiable Credentials* (High Complexity).  
> **Evaluation Deliverable:** Conformance testing, format compatibility matrix, negative path evaluation, and empirical upstream friction analysis.

---

## Executive Summary

The **Inji Interoperability Playground** was constructed to rigorously test, validate, and benchmark verifiable credential workflows across the **MOSIP Inji stack** (Inji Certify, Inji Mobile Wallet, Inji Web, and Inji Verify) and cross-test them against premier independent open-standards implementations: **walt.id** and **Sphereon**.

Over the course of running automated headless conformance suites, interactive browser holder simulations, and real-device physical mobile QR exchanges, we validated cross-ecosystem interoperability across **four distinct credential formats** (W3C VC 1.1 JSON-LD, W3C VC 2.0 JSON-LD, IETF SD-JWT VC, and ISO/IEC 18013-5 mDoc) and identified **6 critical upstream friction points and architectural gaps** in current digital identity specifications.

---

## 1. Supported Credential Formats & Cryptographic Suites

Per Mandatory Task #6, the playground natively supports multiple credential formats end-to-end with clear runtime labeling:

| Credential Format | Specification Baseline | Cryptographic Signature Suite | Holder Binding Method | Ecosystem Status |
|---|---|---|---|:---:|
| **W3C VC JSON-LD 1.1** | W3C VC Data Model v1.1 | `Ed25519Signature2020` | `did:key` (Ed25519) | **VERIFIED** (Local & Collab) |
| **W3C VC JSON-LD 2.0** | W3C VC Data Model v2.0 | `Ed25519Signature2020` | `did:key` (Ed25519) | **VERIFIED** (Local & Collab) |
| **IETF SD-JWT VC** | `draft-ietf-oauth-sd-jwt-vc` | `ES256` (ECDSA P-256) | Key Binding JWT (`kb+jwt`, `cnf.jwk`) | **VERIFIED** (Playground & Wire Engine) |
| **ISO/IEC 18013-5 mDoc** | ISO/IEC 18013-5 (mDL) | `ES256` (COSE_Sign1 MSO) | DeviceKey / `cose_key` | **VERIFIED** (Mock Wire Engine) |

Each test run in the playground UI prominently displays the active format badge (`Format: ldp_vc`, `Format: vc+sd-jwt`, or `Format: mso_mdoc`) and passes format metadata to the downstream protocol inspector and exportable reports.

---

## 2. Cross-Ecosystem Interoperability Matrix

The playground evaluates cross-ecosystem interoperability by orchestrating combinations across four independent stacks:

### 2.1 Issuance Interoperability (Issuer $\rightarrow$ Wallet)

| Issuer Implementation | Wallet Implementation | Credential Format | Protocol Exchange | Outcome |
|---|---|---|---|:---:|
| **Inji Certify (Local Docker)** | Inji Web Wallet | W3C VC 1.1 JSON-LD | OpenID4VCI draft 13 | **PASS** |
| **Inji Certify (Local Docker)** | Inji Mobile (Android) | W3C VC 1.1 JSON-LD | OpenID4VCI + Reverse Tunnel | **PASS** |
| **Inji Certify (Local Docker)** | Sphereon Wallet Mock | W3C VC 1.1 JSON-LD | OpenID4VCI draft 13 | **PASS** |
| **Inji Certify (Local Docker)** | walt.id Wallet Mock | W3C VC 1.1 JSON-LD | OpenID4VCI draft 13 | **PASS** |
| **Playground Mock Issuer** | Inji Mobile (Android) | IETF SD-JWT VC | OpenID4VCI + QR Offer | **PASS** |
| **Sphereon Issuer** | Inji Mobile (Android) | EUDI PID (SD-JWT) | OpenID4VCI draft 13/15 | **PASS** |
| **Sphereon Issuer** | Sphereon Wallet Mock | W3C VC 2.0 (Diploma) | OpenID4VCI draft 13/15 | **PASS** |
| **walt.id Issuer** | Playground Headless Wallet | W3C VC 1.1 JSON-LD | OpenID4VCI draft 13 | **PASS** |
| **MOSIP Collab Inji Certify** | Playground Headless Wallet | W3C VC 1.1 JSON-LD | OpenID4VCI (Pre-Auth Grant) | **UPSTREAM GAP** *(Grant Mismatch)* |

---

### 2.2 Verification Interoperability (Wallet $\rightarrow$ Verifier)

| Wallet Implementation | Verifier Implementation | Presentation Format | Protocol Exchange | Outcome |
|---|---|---|---|:---:|
| **Inji Web Wallet** | Inji Verify (Local Docker) | W3C VP (JSON-LD) | Direct Post / Local API | **PASS** |
| **Inji Mobile (Android)** | Inji Verify (Collab Cloud) | W3C VP (JSON-LD) | OpenID4VP QR / Cross-Device | **PASS** |
| **Sphereon Wallet Mock** | Inji Verify (Local Docker) | W3C VP (JSON-LD) | OpenID4VP draft 21 | **PASS** |
| **walt.id Wallet Mock** | Inji Verify (Local Docker) | W3C VP (JSON-LD) | OpenID4VP draft 21 | **PASS** |
| **Playground Headless Wallet** | Sphereon Verifier | W3C VP (JSON-LD) | OpenID4VP + DIF PEX v2 | **PASS** |
| **Playground Headless Wallet** | Sphereon Verifier | IETF SD-JWT VP | OpenID4VP + DIF PEX v2 | **PASS** |
| **Playground Headless Wallet** | walt.id Verifier | W3C VP (JSON-LD) | OpenID4VP draft 21 | **PASS** |
| **Playground Headless Wallet** | Inji Verify (`/v2/vc-verification`) | IETF SD-JWT (`did:key`) | Direct Post JSON | **UPSTREAM GAP** *(Requires x5c)* |

---

## 3. Replay & Tamper Testing (Negative Validation Paths)

Per Good-to-have Task #4, the playground features an interactive **Tamper Engine** that deliberately mutates verifiable presentations to validate error boundary handling:

| Tamper Vector | Description | Verification Target | Expected Behavior | Actual Behavior |
|---|---|---|---|:---:|
| **CORRUPT_SIGNATURE** | Bitflip inversion of cryptographic signature payload (`proofValue` or JWS signature) | Inji Verify & Sphereon Verifier | Immediate rejection (`ERR_SIGNATURE_VERIFICATION_FAILED`) | **PASS** (Rejection confirmed) |
| **EXPIRED_TIMESTAMP** | Mutates `expirationDate` or `exp` claim to 24 hours in the past | Inji Verify & Sphereon Verifier | Expiration flag raised (`ERR_CREDENTIAL_EXPIRED`) | **PASS** (Rejection confirmed) |
| **INVALID_TYPE** | Mutates `@type` to an unresolvable schema uri | Inji Verify & Sphereon Verifier | Schema validation failure | **PASS** (Rejection confirmed) |
| **CHALLENGE_MISMATCH** | Uses stale verifier `nonce` in presentation | OpenID4VP Direct Post | Replay attack rejection | **PASS** (Rejection confirmed) |

---

## 4. Real-World Upstream Findings & Friction Points

Testing across multiple independent implementations uncovered **6 major technical friction points**:

### Finding 1: OpenID4VCI Automated Grant Mismatch in Hosted Sandboxes
- **Observed Behavior:** Hosted Collab Inji Certify instances (`certify-mock`, `certify-farmer`, `certify-mosipid`) strictly offer `authorization_code` in their `.well-known/openid-credential-issuer` metadata. They omit the `pre-authorized_code` grant.
- **Impact:** Automated CI/CD pipelines, nightly regression suites, and headless mock wallets cannot obtain credentials from Collab Certify without an interactive human completing eSignet email/OTP authentication.
- **Playground Solution:** The playground implements a dual-mode engine:
  1. An interactive OIDC PKCE simulation with an embedded eSignet consent UI.
  2. A fully conformant OpenID4VCI draft-13/15 mock issuer that advertises `pre-authorized_code` and `nonce_endpoint`, allowing automated testing to execute 100% headlessly.

---

### Finding 2: Inji Certify Docker Nginx Audience (`aud`) Rewriting
- **Observed Behavior:** Inji Certify running behind Docker Nginx (`certify-nginx:80`) strictly validates the `openid4vci-proof+jwt` `aud` claim against its internal Docker hostname (`http://certify-nginx:80`) rather than the external public/tunneled URL accessed by external wallets.
- **Impact:** External wallets and smartphones fail proof verification with `400 Bad Request: Invalid Audience`.
- **Playground Solution:** The BFF proxy intercepts issuer discovery and transparently injects `_internal_credential_issuer`. The wallet detects this hint and signs the proof JWT with the internal audience expected by Certify, ensuring successful verification.

---

### Finding 3: Inji Verify SD-JWT VC Verification Requires X.509 Certificate Chain (`x5c`)
- **Observed Behavior:** When submitting an IETF SD-JWT VC signed with standard decentralized `did:key` or JWK to Inji Verify's `/v2/vc-verification`, the endpoint returns HTTP 200 with:
  ```json
  {
    "allChecksSuccessful": false,
    "schemaAndSignatureCheck": {
      "valid": false,
      "error": {
        "errorCode": "ERR_SIGNATURE_VERIFICATION_FAILED",
        "errorMessage": "Exception during Verification: getX509CertChain(...) must not be null"
      }
    }
  }
  ```
- **Friction Point:** Inji Verify currently assumes all SD-JWT VCs derive from an X.509 PKI trust framework (standard in European eIDAS), failing to resolve public keys from decentralized DID methods (`did:key`, `did:jwk`).
- **Playground Solution:** The playground implements local SD-JWT cryptographic verification (verifying disclosures and KB-JWT `sd_hash` against `did:key`) while routing X.509-backed tokens to Inji Verify, making this requirement measurable.

---

### Finding 4: Presentation Exchange v1 vs OpenID4VP DCQL v2 Dialect Divergence
- **Observed Behavior:** Inji Verify supports Digital Credentials Query Language (DCQL v2) and Presentation Exchange v1, whereas Sphereon and walt.id prioritize DIF Presentation Exchange v2 (`input_descriptors` with JSONPath field constraints).
- **Impact:** Wallets expecting DCQL fail when handed a strict DIF PEX v2 query, and vice versa.
- **Playground Solution:** The playground includes a dynamic query synthesizer that normalizes queries across both DCQL v2 and DIF PEX v2 dialects.

---

### Finding 5: Mobile QR Payload Sizing Limits and Compression
- **Observed Behavior:** When encoding large credentials (such as W3C JSON-LD with full canonical contexts or multi-claim Farmer identities) directly into an OpenID4VP QR code, the QR density exceeds camera resolution on standard smartphones.
- **Impact:** Mobile cameras fail to decode dense QR codes.
- **Playground Solution:** The playground implements OpenID4VP *Request by Reference* (`request_uri`), transmitting a lightweight pointer in the QR code and downloading the full query over HTTP/WebSocket.

---

### Finding 6: Cross-Ecosystem Cryptographic Proof Incompatibilities
- **Observed Behavior:** Minor canonicalization discrepancies exist between Digital Bazaar's reference `Ed25519Signature2020` suite (URDNA2015 RDF dataset canonicalization) and non-RDF JSON-LD normalizers used by some external platforms.
- **Playground Solution:** Inlined self-contained `@context` vocabularies to ensure offline mathematical reproducibility across all implementations.

---

## 5. Actionable Recommendations for MOSIP Inji Teams

1. **Inji Certify**:
   - Add support for the `pre-authorized_code` grant in sandbox environments to facilitate automated developer integrations and CI testbeds.
   - Accept external `Host` or `X-Forwarded-Host` headers when verifying the proof-of-possession `aud` claim.
2. **Inji Verify**:
   - Extend `/v2/vc-verification` to support decentralized DID resolution (`did:key`, `did:jwk`) for SD-JWT VCs alongside X.509 certificate chains.
3. **Mimoto & Inji Mobile**:
   - Standardize on OpenID4VP *Request by Reference* (`request_uri`) as the default for all cross-device presentations.
