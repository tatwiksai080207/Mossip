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

### Finding 5: Cross-Ecosystem Verification with walt.id External Verifier
- **Cross-Ecosystem Validation:** The playground integrates a standalone non-Inji reference verifier matching the **walt.id Community Suite** OpenID4VP specification.
- **Interoperability Resolution:** While Inji Verify (0.17.0) rejects decentralized `did:key` SD-JWT VCs due to mandatory X.509 `x5c` certificate enforcement (Finding 3), the **walt.id OpenID4VP Verifier** natively resolves `did:key` and verifies the same SD-JWT VC credential successfully (`SUCCESS`).
- **Significance:** This conclusively demonstrates that credentials issued within the MOSIP/Inji ecosystem conform to international decentralized identity standards and can be verified across foreign relying party stacks without vendor lock-in.

### Finding 6: Cross-Ecosystem Issuance with walt.id External Issuer
- **Cross-Ecosystem Validation:** The playground integrates a standalone non-Inji reference issuer matching the **walt.id Community Suite** OpenID4VCI specification, advertising `pre-authorized_code` grant (Draft 13) and `nonce_endpoint` (Draft 15).
- **Interoperability Resolution:** Inji holders (Inji Web and Inji Mobile) ingest both W3C VC 1.1 / 2.0 (`Ed25519Signature2020`) and IETF SD-JWT VC (`vc+sd-jwt`) issued by walt.id. Furthermore, these externally-issued credentials can be verified seamlessly by both **Local Inji Verify** and **walt.id Verifier**.
- **Significance:** Demonstrates full bi-directional, cross-ecosystem interoperability:
  1. `walt.id Issuer` $\rightarrow$ `Inji Web` $\rightarrow$ `Local Inji Verify` (Third-party credential verified by Inji)
  2. `walt.id Issuer` $\rightarrow$ `Inji Web` $\rightarrow$ `walt.id Verifier` (100% external-to-external lifecycle mediated through MOSIP Inji Web wallet)
  3. `Local Inji Certify` $\rightarrow$ `Inji Web` $\rightarrow$ `walt.id Verifier` (Inji credential verified by third party)

### Finding 7: OpenID4VP DCQL `doctype_values` Metadata Query Gap in Collab Inji Verify
- **Observed Behavior:** When issuing and presenting an ISO/IEC 18013-5 mDoc credential (`mso_mdoc`) via `Inji Certify (Collab Interactive)` $\rightarrow$ `Inji Web (Collab Interactive OTP)` to `Inji Verify (Collab Live Engine)` using standard OpenID4VP Draft 23+ DCQL syntax:
  ```json
  {
    "clientId": "injiverify.collab.mosip.net/",
    "dcqlQuery": {
      "credentials": [{
        "id": "collab-mosipid-mdoc",
        "format": "mso_mdoc",
        "meta": { "doctype_values": ["org.iso.18013.5.1.mDL"] }
      }]
    }
  }
  ```
  Collab Inji Verify (`injiverify.collab.mosip.net/v1/verify/v2/vp-request`) rejects the request with HTTP 400:
  ```json
  {
    "errorCode": "UNKNOWN_FIELD",
    "errorMessage": "Unknown field: doctype_values"
  }
  ```
  Furthermore, if `doctype_values` is omitted or changed, the endpoint responds with `{"errorCode": "dcql_query.credentials", "errorMessage": "DCQL credential format must be a valid format."}`.
- **Friction Point & Specification Gap:** The deployed MOSIP Collab cloud instance of `verify-service` only implements DCQL v2 parsing for `ldp_vc` (`type_values`) and `vc+sd-jwt` (`vct_values`). It has not yet integrated the OpenID4VP Draft 23+ ISO 18013-5 `doctype_values` metadata query parser. Concurrently, the legacy Presentation Exchange v1 endpoint (`/v1/verify/vp-request`) is disabled or returns HTTP 404 in the Collab cloud deployment.
- **Interoperability Resolution:** The playground supports dual verification engines:
  1. For `mso_mdoc` verification, the playground routes the presentation to **Local Inji Verify (Docker port 8095)** and the external reference **walt.id Verifier**, both of which implement ISO 18013-5 mDoc verification via Presentation Exchange (`presentationDefinition` with `format: { mso_mdoc: { alg: ["ES256"] } }`), successfully completing the 7/7 step verification with cryptographic verification of the MSO signature, digest elements, and device authentication.
  2. For live Collab Inji Verify runs, the playground provides real-time in-app guidance advising developers of the upstream DCQL gap and directing them to test W3C VC 1.1, W3C VC 2.0, or SD-JWT VC on the live Collab verifier.
- **Problem Statement Significance:** Fulfills Problem Statement Goal 1.b (*"Surface real interoperability gaps (format mismatches, proof-type incompatibilities, DID method gaps, QR size limits, etc.) that the core teams can act on"*) and Good-to-have Task #2 (*"Add mDoc/mDL (ISO/IEC 18013-5) as a third credential format"*), providing an actionable bug report for upstream MOSIP engineers (`mosip/inji-verify`).

---

## 4. Exportable Reports & Matrix Evaluation

The playground includes export capabilities:
- **Interactive Interoperability Matrix:** Automatically groups test history by `Issuer × Wallet × Verifier × Format`.
- **Markdown (.md) and JSON Export:** The Test Report component generates downloadable artifacts recording the full configuration, wire sources (live vs mock), and timestamped step payloads for submission and auditing.
