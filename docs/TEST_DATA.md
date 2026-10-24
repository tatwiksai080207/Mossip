# MOSIP Inji Interoperability Playground: Test Data Catalog

> **Deliverable Reference:** In accordance with the *MOSIP Decode 2026 Submission Guidelines* ("Test Data: List and submit all the sample test data that is necessary for the test, such as account details and credentials etc.").

This document details all test personas, account identifiers, cryptographic keys, authentication parameters, raw credential payloads, and tampering vectors utilized across the **Inji Interoperability Playground**.

---

## Table of Contents
1. [Test Identities & Resident Personas](#1-test-identities--resident-personas)
2. [Cryptographic Keys & DID Test Vectors](#2-cryptographic-keys--did-test-vectors)
3. [Authentication Grants & Mock OTPs](#3-authentication-grants--mock-otps)
4. [Sample Credential Wire Payloads (All 4 Formats)](#4-sample-credential-wire-payloads-all-4-formats)
5. [Tampering & Negative Test Vectors](#5-tampering--negative-test-vectors)
6. [Sandbox Environment Connectivity Matrix](#6-sandbox-environment-connectivity-matrix)

---

## 1. Test Identities & Resident Personas

The playground provisions standardized test identities to evaluate credential issuance, selective disclosure, and presentation verification across multiple identity domains.

### Persona 1: Resident National Identity (MOSIP Collab UIN)
*Used for Inji Mobile Wallet registration, Collab eSignet authentication, and National ID VC issuance.*
* **Full Name:** Resident Test User
* **MOSIP Unique Identification Number (UIN):** `1111222233` (Template / Self-Registered)
* **Registered Email:** `resident.test@example.org`
* **Date of Birth:** `1995-08-15`
* **Gender:** `Male`
* **Self-Registration Portal:** [https://self-register.collab.mosip.net/](https://self-register.collab.mosip.net/)
* **Associated Issuers:** `certify-mosipid` (Collab), `Playground Headless Issuer`
* **Supported Formats:** W3C VC 1.1 / 2.0 (JSON-LD), IETF SD-JWT VC

#### Generating and Configuring Your Own Personal MOSIP UIN
Any evaluator or developer can test the live end-to-end flow with their own personal identity and receive live OTP emails:
1. **Register on MOSIP Collab**: Visit the public self-registration portal at [https://self-register.collab.mosip.net/](https://self-register.collab.mosip.net/).
2. **Submit Details**: Enter your name, date of birth, gender, and personal email address. Complete the email verification step.
3. **Obtain UIN**: The portal generates a fresh, unique 10-digit UIN (e.g. `1111222233`) bound to your email.
4. **Update Playground Configuration**:
   - Option A (Recommended): Create `server/config/identities.local.json` (git-ignored to protect your private credentials):
     ```json
     {
       "resident": {
         "uin": "YOUR_NEW_10_DIGIT_UIN",
         "fullName": "Your Name",
         "dateOfBirth": "YYYY/MM/DD",
         "gender": "MLE",
         "phone": "Your Mobile Number"
       }
     }
     ```
   - Option B: Set environment variables `RESIDENT_UIN`, `RESIDENT_FULL_NAME`, and `RESIDENT_PHONE`.
   - Option C: Update [server/config/identities.json](file:///c:/Mossip/inji-playground/server/config/identities.json) directly.
5. **Run the Flow**: During eSignet authentication, use your new UIN. The MOSIP eSignet service will send the authentication OTP directly to your personal email address.
*(Note: For immediate zero-setup evaluation without creating a MOSIP Collab account, use the Mock Issuer where OTP `111111` is accepted immediately without external email dependency).*

---

### Persona 2: Sandbox Baseline Resident (Asha Raghunathan)
*Used for headless automated issuance walks and Mimoto database injection.*
* **Full Name:** Asha Raghunathan
* **Date of Birth:** `1991-07-14`
* **Gender:** `Female`
* **Email:** `asha.r@example.org`
* **Region / State:** `Karnataka`
* **Country:** `India`
* **Associated Issuers:** `certify-mock` (Collab), Inji Web local DB bridge

---

### Persona 3: Agricultural Producer (Farmer Identity)
*Used for high-granularity selective disclosure testing via IETF SD-JWT VC and schema validation in Inji Certify.*
* **Full Name:** Gorge Cooper
* **Farmer ID:** `2154189532`
* **Mobile Number:** `9876543210`
* **Date of Birth:** `1990-05-25`
* **Gender:** `Male`
* **State / District:** Karnataka, Bangalore
* **Village / Postal Code:** Koramangala, `453000`
* **Land Area:** `3 hectares`
* **Land Ownership Type:** `Owner`
* **Primary Crop:** `Maize`
* **Secondary Crop:** `Rice`
* **VCT URI:** `https://inji.mosip.io/credentials/farmer-identity`
* **Associated Issuers:** `certify-farmer` (Collab), Local Certify Spring Boot

---

### Persona 4: Licensed Driver (ISO/IEC 18013-5 mDL)
*Used for mDoc CBOR binary format testing and offline verifier interactions.*
* **Full Name:** Ramesh Chandra Verma
* **Driving License Number:** `KA-2024-998822`
* **Date of Birth:** `1988-11-03`
* **Document Type:** `org.iso.18013.5.1.mDL`
* **Vehicle Categories:** `A` (Motorcycle), `B` (Passenger Car)
* **Issuing Authority:** State Transport Authority, Karnataka

---

### Persona 5: Cross-Ecosystem External Resident (Sphereon EUDI Persona)
*Used for cross-ecosystem EUDI PID and European Diploma issuance/verification via Sphereon.*
* **Full Name:** Alice Martin
* **EUDI PID Number:** `EUDI-DE-2026-992144`
* **Date of Birth:** `1994-03-12`
* **Nationality:** `DE` (Germany)
* **University Degree:** Master of Science in Computer Science
* **Issuing Institution:** University of Amsterdam / Sphereon Academic Issuer
* **Associated Issuers:** Sphereon Reference Issuer (`/api/external/sphereon/issuer`)
* **Supported Formats:** EUDI PID (SD-JWT), European Diploma (W3C VC 2.0), EHIC (W3C VC 1.1)

---

## 2. Cryptographic Keys & DID Test Vectors

### 2.1 Ed25519 Keypair Vector (`did:key`)
Used for W3C VC JSON-LD 1.1 & 2.0 signatures via `Ed25519Signature2020`:
* **DID Identifier:**
  ```text
  did:key:z6MkhaXg1NDV25T2xBGudafCD28876GXXD2Zn5UqCUnGu5PN
  ```
* **Raw Public Key (Hex):**
  ```text
  11b6664e320f0e0bc4adfc0dd77884ea629bcac1d9ec3725b8ad28f1496a7d55
  ```
* **Multicodec Prefix:** `0xed01` (Ed25519 public key in multiformats)

---

### 2.2 ECDSA P-256 Keypair Vector (`did:jwk` / JWK)
Used for IETF SD-JWT VC signatures, Key Binding JWTs, and ISO 18013-5 mDoc COSE_Sign1:
* **Public JWK:**
  ```json
  {
    "kty": "EC",
    "crv": "P-256",
    "x": "WKn-ShDD4X6P9sWw4Pz3D7t9q1v6H-2H6S9f3b1s0P4",
    "y": "v9F-mZ4k0X8A3_q-T2u8mP1r7K-4j9D6e1s8g2X0mN4"
  }
  ```

---

## 3. Authentication Grants & Mock OTPs

* **Pre-Authorized Code Grant:** Fixed and dynamic UUIDs (TTL: 600s).
* **Mock eSignet Email OTP:**
  * Success OTP: `111111`
  * Error / Invalid OTP: `000000`
* **OAuth 2.0 PKCE Code Challenge Method:** `S256` (`SHA-256` of randomly generated 43-character `code_verifier`).

---

## 4. Sample Credential Wire Payloads (All 4 Formats)

### 4.1 W3C Verifiable Credential 1.1 (JSON-LD)
```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://w3id.org/security/suites/ed25519-2020/v1"
  ],
  "id": "urn:uuid:7f6a5b82-9382-41f2-901b-88a91c530182",
  "type": ["VerifiableCredential", "PlaygroundIdentityCredential"],
  "issuer": "did:key:z6MkhaXg1NDV25T2xBGudafCD28876GXXD2Zn5UqCUnGu5PN",
  "issuanceDate": "2026-10-22T08:15:38Z",
  "credentialSubject": {
    "id": "did:key:z6MkpTHR8VNsBxY6vpGEecJwbnXE7w2KPye8xT5L9j5gH5u2",
    "fullName": "Resident Test User",
    "uin": "1111222233",
    "email": "resident.test@example.org",
    "gender": "Male",
    "dateOfBirth": "1995-08-15"
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2026-10-22T08:15:38Z",
    "verificationMethod": "did:key:z6MkhaXg1NDV25T2xBGudafCD28876GXXD2Zn5UqCUnGu5PN#z6MkhaXg1NDV25T2xBGudafCD28876GXXD2Zn5UqCUnGu5PN",
    "proofPurpose": "assertionMethod",
    "proofValue": "z39A8FcW2tK9Jm7vL..."
  }
}
```

---

### 4.2 IETF SD-JWT VC (Compact Wire Format)
```text
eyJhbGciOiJFUzI1NiIsInR5cCI6InZjK3NkLWp3dCJ9.eyJfc2QiOlsidk5kSGJnV1...
~WyI2TjFwWVFRbTFjVjkiLCAibmFtZSIsICJHb3JnZSBDb29wZXIiXQ
~WyJkM2oxZk4xY01rTzkiLCAibW9iaWxlIiwgIjk4NzY1NDMyMTAiXQ
~WyJ4MTlsTjJkMVBNMzAiLCAibGFuZF9hcmVhIiwgIjMgaGVjdGFyZXMiXQ
~eyJhbGciOiJFUzI1NiIsInR5cCI6ImtiK2p3dCJ9.eyJub25jZSI6InZlcmlmaWVyXzEx..."
```

---

### 4.3 ISO/IEC 18013-5 mDoc (CBOR Binary in Hex)
```text
a36776657273696f6e63312e306b646f63756d656e747381a367646f6354797065
716f72672e69736f2e31383031332e352e312e6d444c6c6973737565725369676e
6564a2646e616d6561626f72672e69736f2e31383031332e352e316d656c656d65
6e7456616c756573...
```

---

## 5. Tampering & Negative Test Vectors

1. **`CORRUPT_SIGNATURE` Vector**:
   - Original `proofValue`: `z39A8FcW2tK9Jm7vL4n5...`
   - Inverted Bitflip Vector: `z39A8FcW2tK9Jm7vL4n5_MUTATED_BITFLIP_x00FF`
2. **`EXPIRED_TIMESTAMP` Vector**:
   - Valid `issuanceDate`: `2026-10-22T08:15:38Z`
   - Expired `expirationDate`: `2024-01-01T00:00:00Z`
3. **`INVALID_TYPE` Vector**:
   - Valid: `["VerifiableCredential", "PlaygroundIdentityCredential"]`
   - Malicious: `["VerifiableCredential", "FakeCorruptedIdentityPayload_UnknownSchema"]`

---

## 6. Sandbox Environment Connectivity Matrix

| Service | Target URL / Port | Role | Protocol |
|---|---|---|---|
| **Inji Certify (Collab)** | `https://injicertify-mock.collab.mosip.net` | Upstream Issuer Sandbox | HTTPS / OpenID4VCI |
| **Inji Verify (Collab)** | `https://injiverify.collab.mosip.net` | Upstream Verifier Sandbox | HTTPS / OpenID4VP |
| **eSignet IdP (Collab)** | `https://esignet-mosipid.collab.mosip.net` | Upstream User Auth | HTTPS / OAuth 2.0 PKCE |
| **Local Inji Certify** | `http://localhost:8090` | Containerized Issuer | HTTP |
| **Local Inji Verify** | `http://localhost:8095` | Containerized Verifier | HTTP |
| **Local Inji Mimoto** | `http://localhost:8099` | Containerized Wallet BFF | HTTP |
| **Local Inji Web** | `http://localhost:3004` | Browser Wallet Client | HTTP |
| **Playground BFF Server**| `http://localhost:3001` | Core Orchestrator & Proxy | HTTP / WebSocket |
| **Playground Frontend** | `http://localhost:3000` | Interop Studio UI | HTTP |
