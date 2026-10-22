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
* **Full Name:** Molleti Tatwik Sai
* **MOSIP Unique Identification Number (UIN):** `6207495860`
* **Registered Email:** `tatwiksai@gmail.com`
* **Date of Birth:** `1995-08-15`
* **Gender:** `Male`
* **Self-Registration Portal:** [https://self-register.collab.mosip.net/](https://self-register.collab.mosip.net/)
* **Associated Issuers:** `certify-mosipid` (Collab), `Playground Headless Issuer`
* **Supported Formats:** W3C VC 1.1 / 2.0 (JSON-LD), IETF SD-JWT VC

### Persona 2: Sandbox Baseline Resident (Asha Raghunathan)
*Used for headless automated issuance walks and Mimoto database injection.*
* **Full Name:** Asha Raghunathan
* **Date of Birth:** `1991-07-14`
* **Gender:** `Female`
* **Email:** `asha.r@example.org`
* **Region / State:** `Karnataka`
* **Country:** `India`
* **Associated Issuers:** `certify-mock` (Collab), Inji Web local DB bridge

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

### Persona 4: Licensed Driver (ISO/IEC 18013-5 mDL)
*Used for binary CBOR / COSE mDoc mobile driving license issuance and offline BLE presentation flows.*
* **Family Name:** Cooper
* **Given Name:** Gorge
* **Birth Date:** `1990-05-25`
* **Issue Date:** `2023-01-15`
* **Expiry Date:** `2033-01-15`
* **Issuing Country:** `IN`
* **Issuing Authority:** `Karnataka Transport Department`
* **Document Number:** `DL-5720110023456`
* **Driving Privileges:** `B`, `A1` (Motor vehicles and light motorcycles)
* **DocType:** `org.iso.18013.5.1.mDL`

### Persona 5: Health & General Insurance Policyholder
*Used for multi-claim verification and insurance claims verification testing.*
* **Policy Number:** `INS-990011`
* **Policyholder:** Molleti Tatwik Sai
* **Sum Assured:** `₹ 5,00,000`
* **Policy Status:** `Active`
* **Associated Issuer:** `certify-insurance` (Collab)

---

## 2. Cryptographic Keys & DID Test Vectors

All cryptographic keypairs adhere to W3C DID Core specifications and IETF JOSE / COSE standards.

### 2.1 Issuer Cryptographic Keys

#### Issuer Keypair 1: Ed25519 (`did:key`)
*Used for W3C VC 1.1 / 2.0 JSON-LD credentials signed with `Ed25519Signature2020`.*
* **DID:** `did:key:z6Mkk7yqnWbK2Gf5jF8N1vQj9wX8TzR9P1eLmQk7V4Y3A2B1`
* **Verification Method:** `did:key:z6Mkk7yqnWbK2Gf5jF8N1vQj9wX8TzR9P1eLmQk7V4Y3A2B1#key-0`
* **Algorithm:** `EdDSA` (Curve: `Ed25519`)
* **Public Key JWK:**
```json
{
  "kty": "OKP",
  "crv": "Ed25519",
  "x": "O2BD46gqQ6OOziYaGFpnUKXTcgzsBtF364AFP3H1Q-Y"
}
```

#### Issuer Keypair 2: ECDSA P-256 (`did:key`)
*Used for IETF SD-JWT VC signatures (`ES256`) and ISO 18013-5 mDoc COSE_Sign1 signatures.*
* **DID:** `did:key:zDnaerDaXzoQ9yPQBGkjHg9pY9y7A3N5F8W1K2L3M4N5P6Q7`
* **Verification Method:** `did:key:zDnaerDaXzoQ9yPQBGkjHg9pY9y7A3N5F8W1K2L3M4N5P6Q7#key-0`
* **Algorithm:** `ES256` (Curve: `P-256` / `secp256r1`)
* **Public Key JWK:**
```json
{
  "kty": "EC",
  "crv": "P-256",
  "x": "f83OJ3D2xF1Bg8vub9tLe1gHMzV76e8Tus9uPHvRVEU",
  "y": "x_daQjjUzAhsmcv6z6y3dd307VSZZVMwE02MmTQFY3g"
}
```

---

### 2.2 Wallet Holder Keys

#### Holder Keypair: ECDSA P-256 (Holder Binding & Proof-of-Possession)
* **Algorithm:** `ES256`
* **Public JWK (embedded in `cnf.jwk` of SD-JWT and `proof.jwt` of VCI request):**
```json
{
  "kty": "EC",
  "crv": "P-256",
  "x": "W7Nk5u2qE8O9wT1mK3vR6P4aB8dF0gL2yX5cN9zQ1vA",
  "y": "Y2bF8mP1eL4wK7vR9qT3nB5aD7fG9hJ1kM3pQ5sT7vX"
}
```

#### Holder Keypair: Ed25519 (OpenID4VP Presentation Token Signing)
* **DID:** `did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xU32Wp4nw8Wph`
* **Verification Method:** `did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xU32Wp4nw8Wph#key-0`
* **Purpose:** Signing the top-level `VerifiablePresentation` wrapping the issued credentials.

---

## 3. Authentication Grants & Mock OTPs

### 3.1 Pre-Authorized Grant Codes
* **Grant Type:** `urn:ietf:params:oauth:grant-type:pre-authorized_code`
* **Sample Pre-Authorized Codes:**
  * `poc-c7e19984-7a1a-4933-8a03-75b22b7244ee` (Headless Playground Mock)
  * `mock-grant-playground-2026` (CI Conformance Runner)
* **User PIN Required:** `false` (Automated CI execution)
* **Token Lifetime:** `3600 seconds`

### 3.2 eSignet Interactive Collab Credentials
* **Sandbox Auth URL:** `https://esignet-mosipid.collab.mosip.net`
* **Client ID:** `certify-mosipid`
* **Mock Resident OTP:** `111111` (Default accepted test OTP on Collab eSignet mock identity provider)

---

## 4. Sample Credential Wire Payloads (All 4 Formats)

### 4.1 Format 1: W3C VC 1.1 JSON-LD (Ed25519Signature2020)
```json
{
  "@context": [
    "https://www.w3.org/2018/credentials/v1",
    "https://inji.mosip.io/contexts/identity-v1.jsonld"
  ],
  "id": "urn:uuid:6ca84294-82a1-43ee-bc6b-c74149dd77e2",
  "type": ["VerifiableCredential", "PlaygroundIdentityCredential"],
  "issuer": "did:key:z6Mkk7yqnWbK2Gf5jF8N1vQj9wX8TzR9P1eLmQk7V4Y3A2B1",
  "issuanceDate": "2026-10-22T06:00:00Z",
  "credentialSubject": {
    "id": "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xU32Wp4nw8Wph",
    "fullName": "Molleti Tatwik Sai",
    "dateOfBirth": "1995-08-15",
    "gender": "Male",
    "uin": "6207495860",
    "region": "Karnataka"
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2026-10-22T06:00:00Z",
    "verificationMethod": "did:key:z6Mkk7yqnWbK2Gf5jF8N1vQj9wX8TzR9P1eLmQk7V4Y3A2B1#key-0",
    "proofPurpose": "assertionMethod",
    "proofValue": "z2eQ9yV63wB8F5mK8R9jQ2aT4bV7cX0zP1eLmQk7V4Y3A2B1C6dE9fG2hJ5kL8mN1pQ4rS7tU0vW"
  }
}
```

---

### 4.2 Format 2: W3C VC 2.0 JSON-LD
```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://inji.mosip.io/contexts/farmer-v2.jsonld"
  ],
  "id": "urn:uuid:88e14294-82a1-43ee-bc6b-c74149dd99aa",
  "type": ["VerifiableCredential", "FarmerCredential"],
  "issuer": "did:key:z6Mkk7yqnWbK2Gf5jF8N1vQj9wX8TzR9P1eLmQk7V4Y3A2B1",
  "validFrom": "2026-10-22T06:00:00Z",
  "credentialSubject": {
    "id": "did:key:z6MkpTHR8VNsBxYAAWHut2Geadd9jSwuBV8xU32Wp4nw8Wph",
    "fullName": "Gorge Cooper",
    "farmerID": "2154189532",
    "landArea": "3 hectares",
    "primaryCropType": "Maize"
  },
  "proof": {
    "type": "Ed25519Signature2020",
    "created": "2026-10-22T06:00:00Z",
    "verificationMethod": "did:key:z6Mkk7yqnWbK2Gf5jF8N1vQj9wX8TzR9P1eLmQk7V4Y3A2B1#key-0",
    "proofPurpose": "assertionMethod",
    "proofValue": "z4fK9mP1eL4wK7vR9qT3nB5aD7fG9hJ1kM3pQ5sT7vX0yZ2bF8mP1eL4wK7vR9qT3nB5aD7fG9"
  }
}
```

---

### 4.3 Format 3: IETF SD-JWT VC (Farmer Identity)
* **Wire Representation Structure:** `<Issuer-JWT>~<Disclosure-1>~<Disclosure-2>~<Disclosure-3>~<KB-JWT>`
* **Decoded Issuer JWT Payload:**
```json
{
  "iss": "https://localhost:3001/api/playground-issuer",
  "vct": "https://inji.mosip.io/credentials/farmer-identity",
  "iat": 1792651200,
  "exp": 1824187200,
  "cnf": {
    "jwk": {
      "kty": "EC",
      "crv": "P-256",
      "x": "W7Nk5u2qE8O9wT1mK3vR6P4aB8dF0gL2yX5cN9zQ1vA",
      "y": "Y2bF8mP1eL4wK7vR9qT3nB5aD7fG9hJ1kM3pQ5sT7vX"
    }
  },
  "_sd": [
    "2xP7W8m1kL9vR4qT7nB2aD5fG8hJ0kM1pQ3sT5vX7yZ",
    "4mK8R9jQ2aT4bV7cX0zP1eLmQk7V4Y3A2B1C6dE9fG2",
    "9qT3nB5aD7fG9hJ1kM3pQ5sT7vX0yZ2bF8mP1eL4wK7"
  ],
  "_sd_alg": "sha-256"
}
```
* **Sample Decoded Disclosures:**
  * Disclosure 1: `["_salt_w7x9","fullName","Gorge Cooper"]`
  * Disclosure 2: `["_salt_p1q4","farmerID","2154189532"]`
  * Disclosure 3: `["_salt_m8n2","primaryCropType","Maize"]`

---

### 4.4 Format 4: ISO/IEC 18013-5 mDoc (Driving License)
* **DocType:** `org.iso.18013.5.1.mDL`
* **Namespace:** `org.iso.18013.5.1`
* **Digest Algorithm:** `SHA-256`
* **COSE Algorithm:** `-7` (`ES256`)
* **IssuerAuth Signature:** `COSE_Sign1` containing Mobile Security Object (MSO)
* **Sample CBOR Hex Snippet:**
```text
a467646f635479706578166f72672e69736f2e31383031332e352e312e6d444c6a6e616d65537061
636573a178166f72672e69736f2e31383031332e352e3188d8185836a3666469676573745820...
```

---

## 5. Tampering & Negative Test Vectors

These synthetic corruption vectors test Inji Verify and relying-party failure modes.

| Vector ID | Tamper Mode | Target Field | Injected Value | Expected Verifier Result |
|---|---|---|---|---|
| `TV-SIG-01` | Signature Bitflip | `proof.proofValue` | Byte at index 12 flipped (`0x6B` $\rightarrow$ `0x7B`) | `ERR_SIGNATURE_VERIFICATION_FAILED` |
| `TV-SIG-02` | SD-JWT Signature Truncation | Issuer JWT signature | Last 8 characters replaced with `AA==` | `ERR_INVALID_JWS_SIGNATURE` |
| `TV-EXP-01` | Timestamp Expiry | `expirationDate` / `exp` | `2021-01-01T00:00:00Z` (`1609459200`) | `ERR_CREDENTIAL_EXPIRED` |
| `TV-CLM-01` | Claim Value Mutation | `credentialSubject.uin` | Modified from `6207495860` to `9999999999` | `ERR_SIGNATURE_VERIFICATION_FAILED` |
| `TV-AUD-01` | Audience Spoofing | `aud` in proof JWT | Set to `https://unauthorized-party.org` | `ERR_AUDIENCE_MISMATCH` |
| `TV-NON-01` | Replay Attack | `nonce` in VP proof | Replayed stale nonce from previous session | `ERR_NONCE_EXPIRED_OR_INVALID` |

---

## 6. Sandbox Environment Connectivity Matrix

| Module | Host / URL | Credentials / Auth | Port (Local / Cloud) |
|---|---|---|---|
| **Inji Certify (Collab)** | `https://certify-mosipid.collab.mosip.net` | OAuth 2.0 Auth Code / eSignet | `443` |
| **Inji Certify (Docker)** | `http://localhost:8090` | Internal bridge | `8090` / `8091` |
| **Inji Verify (Collab)** | `https://injiverify.collab.mosip.net` | Open endpoint (`skipStatusChecks=true`) | `443` |
| **Inji Verify (Docker)** | `http://localhost:8095` | Internal REST | `8095` |
| **Mimoto BFF (Docker)** | `http://localhost:8099` | API Token | `8099` |
| **Inji Web (Docker)** | `http://localhost:3004` | Browser session | `3004` |
| **PostgreSQL (Mimoto DB)**| `localhost:5433` (Docker) | `postgres / postgres` (DB: `inji_mimoto`) | `5433` |
| **Playground BFF** | `http://localhost:3001` | Open API / Ngrok tunnel | `3001` |
| **Playground UI** | `http://localhost:3000` | Vite Development Server | `3000` |
