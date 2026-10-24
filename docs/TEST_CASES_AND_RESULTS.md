# MOSIP Inji Interoperability Playground: Test Cases & Execution Results

> **Deliverable Reference:** In accordance with the *MOSIP Decode 2026 Submission Guidelines* ("Test Cases and Results: Share a set of test cases and the results of testing the project's functionalities. These demonstrate that the team has considered various edge cases and have tested their solution for reliability and stability.").  
> **Automated Test Results:** **53 / 53 Passing (100% Pass Rate)** across **10 Test Suites**.

This document details the formal test cases, validation procedures, and empirical results for the **Inji Interoperability Playground** across local containers, upstream MOSIP Collab Cloud sandboxes, and independent reference implementations (walt.id and Sphereon).

---

## Table of Contents
1. [Test Methodology & Environment Setup](#1-test-methodology--environment-setup)
2. [Executive Test Summary Metrics](#2-executive-test-summary-metrics)
3. [Automated Vitest Test Suites (53 Tests across 10 Suites)](#3-automated-vitest-test-suites-53-tests-across-10-suites)
4. [Module 1: OpenID4VCI Credential Issuance](#4-module-1-openid4vci-credential-issuance)
5. [Module 2: OpenID4VP Presentation & Verification](#5-module-2-openid4vp-presentation--verification)
6. [Module 3: Negative Paths & Tamper Engine](#6-module-3-negative-paths--tamper-engine)
7. [Module 4: Inji Stack & Mobile Flows](#7-module-4-inji-stack--mobile-flows)
8. [Module 5: Cross-Ecosystem Reference: walt.id](#8-module-5-cross-ecosystem-reference-waltid)
9. [Module 6: Cross-Ecosystem Reference: Sphereon EUDI](#9-module-6-cross-ecosystem-reference-sphereon-eudi)
10. [Module 7: Cryptographic Formats & DIDs](#10-module-7-cryptographic-formats--dids)

---

## 1. Test Methodology & Environment Setup

Testing is orchestrated across three complementary validation layers:

1. **Automated Unit & Integration Test Suites (`npm test`)**:
   - 53 tests executing via Vitest validating cryptographic signing, proof-of-possession verification, DIF Presentation Exchange matching, eSignet OIDC consent simulation, and deterministic tampering.
2. **Headless Conformance CLI Runners**:
   - `npm run check:suite`: Evaluates multi-format signatures (W3C VC 1.1/2.0, SD-JWT VC, mDoc) against live Inji Verify `/v2/vc-verification`.
   - `npx tsx scripts/check-issuance.ts`: End-to-end 7-step OpenID4VCI draft-13 issuance walk with proof-of-possession assertions.
3. **Interactive UI Protocol Inspector & Mobile Testing**:
   - Real-time animated sequence diagrams on `http://localhost:3000` with raw payload inspection.
   - Physical Android device running Inji Mobile Wallet v0.17 connected over an Ngrok reverse tunnel.

---

## 2. Executive Test Summary Metrics

| Test Category | Automated Tests | Manual / End-to-End | Total Scenarios | Passed | Upstream Gaps Identified | Pass Rate |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **Sphereon Suite (Issuer, Verifier, Wallet)** | 7 | 2 | 9 | 9 | 0 | **100%** |
| **walt.id Suite (Issuer & Verifier)** | 7 | 1 | 8 | 8 | 0 | **100%** |
| **OIDC / eSignet Simulation** | 8 | 1 | 9 | 9 | 0 | **100%** |
| **Cryptographic Formats (LDP, SD-JWT, mDoc)** | 6 | 2 | 8 | 8 | 0 | **100%** |
| **Mimoto DB Bridge & PDF Generator** | 6 | 1 | 7 | 7 | 0 | **100%** |
| **Replay & Tamper Engine** | 6 | 1 | 7 | 7 | 0 | **100%** |
| **Provider Registry & Factory** | 4 | 0 | 4 | 4 | 0 | **100%** |
| **Key Generation & DIDs** | 4 | 0 | 4 | 4 | 0 | **100%** |
| **Diagnostics & Upstream Health Probes** | 2 | 1 | 3 | 3 | 0 | **100%** |
| **End-to-End Issuance & Verification Walks** | 3 | 2 | 5 | 5 | 2 (Trapped & Documented) | **100%** |
| **Total** | **53** | **11** | **64** | **64** | **2** | **100%** |

---

## 3. Automated Vitest Test Suites (53 Tests across 10 Suites)

Executing `npm test` runs all 53 automated test cases:

```text
PASS: tests/formats.test.ts (6 tests)
PASS: tests/keys.test.ts (4 tests)
PASS: tests/providers.test.ts (4 tests)
PASS: tests/diagnostics.test.ts (2 tests)
PASS: tests/tamper.test.ts (6 tests)
PASS: tests/mimoto.test.ts (6 tests)
PASS: tests/oidc.test.ts (8 tests)
PASS: tests/sphereon.test.ts (7 tests)
PASS: tests/waltid.test.ts (7 tests)
PASS: tests/issuance.test.ts (3 tests)

Test Files  10 passed (10)
     Tests  53 passed (53)
  Duration  10.70s
```

---

## 4. Module 1: OpenID4VCI Credential Issuance

| Test ID | Scenario | Input / Action | Expected Result | Actual Result | Status |
|---|---|---|---|---|:---:|
| `TC-ISS-01` | **Issuer Metadata Discovery** | `GET /.well-known/openid-credential-issuer` | Returns JSON advertising `credentials_supported` for LDP, SD-JWT, and mDoc. | HTTP 200 with complete credential configurations and endpoints. | **PASS** |
| `TC-ISS-02` | **OAuth 2.0 Auth Server Discovery** | `GET /.well-known/oauth-authorization-server` | Advertises `grant_types_supported` including `pre-authorized_code`. | HTTP 200 with RFC 8414 metadata. | **PASS** |
| `TC-ISS-03` | **Pre-Authorized Offer Creation** | `GET /api/playground-issuer/credential-offer` | Returns offer with valid `pre-authorized_code` and configuration IDs. | HTTP 200 with offer payload and UUID grant. | **PASS** |
| `TC-ISS-04` | **Token Exchange (draft 13)** | `POST /token` with `grant_type=pre-authorized_code` | Returns OAuth `access_token` and fresh `c_nonce`. | HTTP 200; token received, `c_nonce` valid for 3600s. | **PASS** |
| `TC-ISS-05` | **Proof-of-Possession Validation** | `POST /credential` with signed `openid4vci-proof+jwt` | Issuer verifies holder signature against embedded `jwk` and confirms `aud` and `nonce`. | Issuer accepts proof; cryptographic signature verified. | **PASS** |
| `TC-ISS-06` | **W3C VC 1.1 JSON-LD Issuance** | Request `PlaygroundIdentityCredential` | Signed JSON-LD credential returned with `Ed25519Signature2020` proof. | HTTP 200; VC contains canonical `@context` and valid signature. | **PASS** |
| `TC-ISS-07` | **IETF SD-JWT VC Issuance** | Request `FarmerCredential_SD_JWT` | Compact SD-JWT returned containing salted disclosures and holder `cnf.jwk`. | HTTP 200; formatted string `<jwt>~<d1>~<d2>~` returned. | **PASS** |
| `TC-ISS-08` | **Collab Inji Certify Automated Grant Probe** | Query Collab Certify `.well-known` for `pre-authorized_code` | Detects that Collab Certify only exposes `authorization_code`. | Playground detects mismatch, logs upstream gap, and switches to fallback engine. | **PASS (GAP DOCUMENTED)** |

---

## 5. Module 2: OpenID4VP Presentation & Verification

| Test ID | Scenario | Input / Action | Expected Result | Actual Result | Status |
|---|---|---|---|---|:---:|
| `TC-VER-01` | **W3C VP Verification (Inji Verify)** | Submit authentic W3C VP to Inji Verify | Inji Verify validates issuer signature and holder binding. | HTTP 200; `allChecksSuccessful: true`. | **PASS** |
| `TC-VER-02` | **IETF SD-JWT VP Verification** | Submit authentic SD-JWT VP with Key Binding JWT | Validates issuer signature, disclosure digests, and holder `kb-jwt`. | Validated locally and via Sphereon/walt.id engines. | **PASS** |
| `TC-VER-03` | **Inji Verify SD-JWT x5c Probe** | Submit `did:key` SD-JWT to Inji Verify | Traps upstream requirement for X.509 certificate chain (`x5c`). | Rejection error trapped and documented cleanly. | **PASS (GAP DOCUMENTED)** |
| `TC-VER-04` | **ISO/IEC 18013-5 mDoc Verification** | Submit CBOR-encoded mDoc presentation | Validates COSE_Sign1 signature against Mobile Security Object (MSO). | HTTP 200; signature and digest verified. | **PASS** |
| `TC-VER-05` | **DCQL v2 Query Negotiation** | Query with Digital Credentials Query Language | Extracts matching credential claims for specified presentation definition. | Claims matched and filtered correctly. | **PASS** |

---

## 6. Module 3: Negative Paths & Tamper Engine

| Test ID | Scenario | Mutation / Vector | Expected Result | Actual Result | Status |
|---|---|---|---|---|:---:|
| `TC-TAM-01` | **Corrupted Ed25519 Signature** | Byte inversion in `proofValue` string | Inji Verify / Verifier rejects with signature verification failure. | `ERR_SIGNATURE_VERIFICATION_FAILED` raised. | **PASS** |
| `TC-TAM-02` | **Corrupted SD-JWT Signature** | Byte inversion in JWS compact signature segment | SD-JWT verifier rejects invalid signature. | Signature failure rejected. | **PASS** |
| `TC-TAM-03` | **Expired Credential Presentation** | Mutation of `expirationDate` to past date | Verifier detects expiration policy violation. | `ERR_CREDENTIAL_EXPIRED` raised. | **PASS** |
| `TC-TAM-04` | **Invalid Credential Type** | Mutate `@type` to unknown string | Verifier rejects unknown schema. | Schema check fails. | **PASS** |
| `TC-TAM-05` | **Replay Nonce Mismatch** | Re-submit presentation with stale nonce | Verifier rejects replay attack. | Nonce mismatch rejection confirmed. | **PASS** |
| `TC-TAM-06` | **Normal Mode Unchanged** | Set tamper mode to `none` | Payload passes through without byte modification. | Payload unaltered. | **PASS** |

---

## 7. Module 4: Inji Stack & Mobile Flows

| Test ID | Scenario | Target Component | Expected Result | Actual Result | Status |
|---|---|---|---|---|:---:|
| `TC-STK-01` | **Mimoto DB Credential Injection** | PostgreSQL `inji_mimoto` DB | Credential written directly into user wallet datastore. | Credential visible in Inji Web. | **PASS** |
| `TC-STK-02` | **Dynamic PDF Credential Generation** | `/api/mimoto/credentials/:id/pdf` | Cryptographically watermarked PDF returned with embedded QR code. | HTTP 200; valid PDF buffer returned. | **PASS** |
| `TC-STK-03` | **Inji Mobile QR Issuance over Tunnel** | Ngrok Reverse Tunnel Router | Physical Inji Mobile app scans QR, contacts BFF, and downloads VC. | Credential added to Android wallet. | **PASS** |
| `TC-STK-04` | **Inji Mobile QR Verification** | Ngrok Reverse Tunnel Router | Inji Mobile scans verifier QR, signs presentation, and completes verification. | Verifier confirms authentic presentation. | **PASS** |

---

## 8. Module 5: Cross-Ecosystem Reference: walt.id

| Test ID | Scenario | Component | Expected Result | Actual Result | Status |
|---|---|---|---|---|:---:|
| `TC-WLT-01` | **walt.id Issuer Discovery** | `waltid-issuer.ts` | Standards-compliant OpenID4VCI discovery metadata. | HTTP 200; metadata matches walt.id specs. | **PASS** |
| `TC-WLT-02` | **walt.id SD-JWT Issuance** | `waltid-issuer.ts` | Compact SD-JWT issued with holder `did:jwk`. | Valid SD-JWT issued. | **PASS** |
| `TC-WLT-03` | **walt.id Verifier DIF PEX v2** | `waltid-verifier.ts` | Verifies presentation satisfying DIF PEX descriptor constraints. | `vpResultStatus: SUCCESS`. | **PASS** |
| `TC-WLT-04` | **walt.id Format Mismatch Rejection**| `waltid-verifier.ts` | Rejects mDoc presentation when descriptor requests LDP VC Diploma. | `vpResultStatus: FAILED`. | **PASS** |

---

## 9. Module 6: Cross-Ecosystem Reference: Sphereon EUDI

| Test ID | Scenario | Component | Expected Result | Actual Result | Status |
|---|---|---|---|---|:---:|
| `TC-SPH-01` | **Sphereon Issuer Discovery** | `sphereon-issuer.ts` | Advertises EUDI PID, Diploma (VCDM 2.0), and EHIC (VCDM 1.1). | HTTP 200; EUDI configurations advertised. | **PASS** |
| `TC-SPH-02` | **Sphereon Wallet Offer Acceptance** | `sphereon-wallet.ts` | Wallet accepts offer, holds credential, and signs VP for verifier. | Offer accepted; credential stored. | **PASS** |
| `TC-SPH-03` | **Sphereon Verifier Presentation Check**| `sphereon-verifier.ts` | Verifies authentic presentation and rejects tampered state. | `vpResultStatus: SUCCESS` (tampered: `FAILED`). | **PASS** |
| `TC-SPH-04` | **Sphereon DIF PEX Constraints** | `sphereon-verifier.ts` | Verifies presentations against Diploma & EHIC input descriptors. | Validated against DIF PEX constraints. | **PASS** |
| `TC-SPH-05` | **Sphereon EUDI PID SD-JWT with KB-JWT**| `sphereon-verifier.ts` | Cryptographically verifies EUDI PID SD-JWT with holder key binding. | `vpResultStatus: SUCCESS`. | **PASS** |

---

## 10. Module 7: Cryptographic Formats & DIDs

| Test ID | Scenario | Test File | Expected Result | Actual Result | Status |
|---|---|---|---|---|:---:|
| `TC-CRY-01` | **Ed25519 `did:key` Derivation** | `tests/keys.test.ts` | Deterministic `did:key` with multicodec prefix `0xed01`. | Valid `did:key:z6Mk...` derived. | **PASS** |
| `TC-CRY-02` | **ECDSA P-256 JWK Derivation** | `tests/keys.test.ts` | JWK with `crv: P-256`, `kty: EC`, and valid `x`/`y` coordinates. | Valid JWK keypair generated. | **PASS** |
| `TC-CRY-03` | **W3C VC 1.1 Canonical Signing** | `tests/formats.test.ts` | `Ed25519Signature2020` canonicalized with URDNA2015. | Canonical proof generated & verified. | **PASS** |
| `TC-CRY-04` | **W3C VC 2.0 Context Inlining** | `tests/formats.test.ts` | Signs VC under `https://www.w3.org/ns/credentials/v2`. | Self-contained VC 2.0 verified. | **PASS** |
| `TC-CRY-05` | **SD-JWT Salted Disclosures** | `tests/formats.test.ts` | Salts claims with base64url random bytes; hashes in payload. | Disclosures verifiable via SHA-256. | **PASS** |
| `TC-CRY-06` | **ISO 18013-5 CBOR MSO Signing** | `tests/formats.test.ts` | Constructs CBOR payload and signs COSE_Sign1 header. | Valid CBOR buffer returned. | **PASS** |
