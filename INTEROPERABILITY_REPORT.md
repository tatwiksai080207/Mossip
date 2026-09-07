# Verifiable Credentials Interoperability Playground: Interoperability Evaluation Report

## Executive Summary

This report documents the interoperability assessment conducted using the **Inji Interoperability Playground** built for the MOSIP Decode Hackathon. The playground orchestrates end-to-end credential lifecycle flows spanning **OpenID4VCI (Issuance)** and **OpenID4VP (Presentation & Verification)** across diverse issuer, wallet, and verifier implementations in both local containerized environments and the MOSIP Collab Cloud Sandbox.

---

## 1. Supported Credential Formats & Signature Suites

Per Mandatory Task #6, the playground natively supports multiple credential formats end-to-end with clear runtime labeling:

| Credential Format | Specification Baseline | Signature Suite | Holder Binding Method | Status |
|---|---|---|---|---|
| **W3C VC JSON-LD 1.1** | W3C VC Data Model v1.1 | `Ed25519Signature2020` | `did:key` (Ed25519) | ✅ Verified (Local & Collab) |
| **W3C VC JSON-LD 2.0** | W3C VC Data Model v2.0 | `Ed25519Signature2020` | `did:key` (Ed25519) | ✅ Verified (Local & Collab) |
| **IETF SD-JWT VC** | `draft-ietf-oauth-sd-jwt-vc` | `ES256` (ECDSA P-256) | Key Binding JWT (`kb+jwt`, `cnf.jwk`) | ✅ Verified (Playground & Wire Engine) |

Each test run in the playground UI prominently displays the active format badge (`Format: ldp_vc` or `Format: vc+sd-jwt`) and passes format metadata to the downstream protocol inspector and exportable reports.

---

## 2. Replay & Tamper Testing (Negative Validation Paths)

Per Good-to-have Task #4, the playground features an interactive **Tamper Mode** selector:
- **Normal (Valid VP):** Signs compliant presentation tokens matching verifier nonce and audience.
- **Corrupted Signature (Negative Test):** Intentionally mutates the cryptographic signature payload (e.g. flipping bytes or suffixing invalid signature data) to ensure the verifier properly detects and rejects invalid presentations.
- **Malformed / Expired Token:** Simulates expired timestamps and unparseable segments to test error boundary resilience.

---

## 3. Real-World Interoperability Findings & Friction Points

### Finding 1: OpenID4VCI Automated Grant Mismatch in Sandbox
- **Observed Behavior:** Every hosted Collab Inji Certify instance (`certify-mock`, `certify-farmer`, `certify-mosipid`, `certify-insurance`) offers **only** the `authorization_code` grant in its `.well-known/openid-credential-issuer` metadata.
- **Impact:** Automated, headless CI/CD runs and mock wallet probes cannot obtain credentials from Collab Certify without an interactive human completing eSignet email OTP login.
- **Playground Solution:** The playground implements a standards-compliant OpenID4VCI issuer that advertises `pre-authorized_code` (draft 13) and `nonce_endpoint` (draft 15). This enables fully automated, 7/7 step end-to-end runs while faithfully reporting the missing upstream grant.

### Finding 2: Proof-of-Possession `aud` Claim & Reverse Proxy Rewriting
- **Observed Behavior:** Inji Certify running behind Docker Nginx (`certify-nginx:80`) strictly validates the `openid4vci-proof+jwt` `aud` claim against its internal Docker hostname rather than the public/tunneled URL accessed by external wallets.
- **Playground Solution:** The BFF proxy intercepts issuer discovery and transparently injects `_internal_credential_issuer`. The wallet detects this hint and signs the proof JWT with the internal audience expected by Certify, avoiding rejection.

### Finding 3: Inji Verify SD-JWT VC Verification Requires X.509 Certificate Chain (`x5c`)
- **Observed Behavior:** When submitting an IETF SD-JWT VC signed with standard `did:key` or JWK to Inji Verify's `/v2/vc-verification`, the endpoint returns HTTP 200 with:
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
- **Friction Point:** Inji Verify currently expects an X.509 certificate chain (`x5c`) in the issuer JWT header rather than resolving public keys from DID methods (`did:key`, `did:jwk`). While common in EU Digital Identity Wallet trust frameworks, strict requirement of `x5c` causes incompatibility with decentralized `did:key` SD-JWT issuers.
- **Playground Architecture:** The playground contains both standalone local SD-JWT cryptographic verification (which checks disclosures and KB-JWT `sd_hash`) and passes the live token to Inji Verify, making this exact requirement measurable.

### Finding 4: Presentation Exchange v1 vs OpenID4VP DCQL v2 Dialects
- **Observed Behavior:** Local Inji Verify 0.17.0 utilizes the older Presentation Exchange (`presentationDefinition` with `input_descriptors`), whereas Collab Inji Verify uses DCQL (`dcqlQuery`).
- **Playground Solution:** The playground dynamically formats the authorization request and submission descriptor map based on the selected verifier target:
  - Local: `presentation_submission` with `descriptor_map: [{ id, format: "vc+sd-jwt" | "ldp_vp", path: "$" }]`
  - Collab: DCQL query with `format: "vc+sd-jwt"`, `meta: { vct_values: [...] }`.

---

## 4. Exportable Reports & Matrix Evaluation

The playground includes export capabilities:
- **Interactive Interoperability Matrix:** Automatically groups test history by `Issuer × Wallet × Verifier × Format`.
- **Markdown (.md) and JSON Export:** The Test Report component generates downloadable artifacts recording the full configuration, wire sources (live vs mock), and timestamped step payloads for submission and auditing.
