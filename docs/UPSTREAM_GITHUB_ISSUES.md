# Upstream GitHub Issues: Actionable Bug Reports & Feature Requests

> **Context:** As part of the *MOSIP Decode 2026 Interoperability Playground* evaluation, these ready-to-file GitHub issues document real protocol bugs, trust model gaps, and configuration friction points discovered during end-to-end testing across Inji Certify, Inji Verify, walt.id, and Sphereon.
>
> Core MOSIP teams can directly copy, file, and act on these issues in the official repositories.

---

## Issue 1

- **Repository:** [`mosip/inji-verify`](https://github.com/mosip/inji-verify)
- **Title:** `[BUG] SD-JWT VC verification throws NullPointerException: getX509CertChain(...) must not be null when credential uses did:key or did:jwk`
- **Labels:** `bug`, `interop`, `sd-jwt`, `standards-compliance`
- **Severity:** High / Blocker for decentralized wallets

### Description
When submitting a standard IETF SD-JWT Verifiable Presentation issued by decentralized engines (e.g. walt.id, Sphereon, or Microsoft Entra) bound to `did:key` or `did:jwk` without an enterprise X.509 certificate chain, Inji Verify's `/v2/vc-verification` endpoint crashes during signature verification with a Java `NullPointerException`.

### Steps to Reproduce
1. Generate an authentic IETF SD-JWT VC signed using `ES256` (ECDSA P-256) where the issuer DID is `did:key:zDn...` or `did:jwk:{...}`.
2. The credential header contains:
   ```json
   {
     "alg": "ES256",
     "typ": "vc+sd-jwt",
     "kid": "did:key:zDnaeW...#zDnaeW..."
   }
   ```
   *(Note: No `x5c` header is present, adhering to IETF SD-JWT VC draft 06 §3.2.2).*
3. Submit the SD-JWT credential via `POST /v2/vc-verification`:
   ```bash
   curl -X POST https://<inji-verify-host>/v2/vc-verification \
     -H "Content-Type: application/json" \
     -d '{ "verifiableCredentials": ["<sd_jwt_compact_string>"] }'
   ```
4. Observe HTTP response:
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

### Expected Behavior (per Specification)
Per [IETF SD-JWT-based Verifiable Credentials §5.1](https://datatracker.ietf.org/doc/draft-ietf-oauth-sd-jwt-vc/), an SD-JWT VC issuer key MAY be identified via `x5c`, but verifiers MUST also support public key resolution via W3C Decentralized Identifiers (`did:key`, `did:jwk`, `did:web`) or `jwks_uri`. If `x5c` is absent, the verifier should resolve the public key from the `kid` / `iss` DID document rather than throwing a `NullPointerException`.

### Actual Behavior
The verifier unconditionally assumes an X.509 PKI trust registry is present, calling `getX509CertChain(...)` on the parsed JWT header, failing all non-eIDAS decentralized credentials.

### Suggested Fix
In `SDJWTVerifier.java`:
```java
// Check if x5c is present; if not, fall back to DID / JWK resolver
List<X509Certificate> certChain = header.getX509CertChain();
if (certChain != null && !certChain.isEmpty()) {
    return verifyWithX509(jwt, certChain);
} else if (header.getKeyID() != null && header.getKeyID().startsWith("did:")) {
    PublicKey resolvedKey = didResolver.resolvePublicKey(header.getKeyID());
    return verifyWithPublicKey(jwt, resolvedKey);
} else {
    throw new VerificationException("Neither x5c nor resolvable DID key ID present in header");
}
```

---

## Issue 2

- **Repository:** [`mosip/inji-certify`](https://github.com/mosip/inji-certify)
- **Title:** `[BUG] OpenID4VCI proof-of-possession audience validation fails behind reverse proxy (Nginx / Ingress)`
- **Labels:** `bug`, `openid4vci`, `deployment`, `docker`
- **Severity:** High / Breaks mobile wallet issuance

### Description
Inji Certify validates the `aud` claim in the client's `openid4vci-proof+jwt` against its local container server address (`http://certify-nginx:80/v1/certify`) instead of respecting the public client-facing hostname passed via standard `X-Forwarded-Host` / `X-Forwarded-Proto` headers.

### Steps to Reproduce
1. Deploy Inji Certify locally using standard `docker-compose.yml` where `certify-nginx` forwards traffic to `certify:8090`.
2. Expose the stack over a secure reverse proxy or Ngrok tunnel (e.g. `https://mossip.example.org`).
3. Connect an external mobile wallet (e.g. Inji Mobile Android).
4. The wallet fetches metadata from `https://mossip.example.org/.well-known/openid-credential-issuer` and creates an `openid4vci-proof+jwt` with:
   ```json
   {
     "aud": "https://mossip.example.org/v1/certify",
     "nonce": "c_nonce_xyz123",
     "iat": 1792999400
   }
   ```
5. Submit to `POST /v1/certify/credential`:
   ```bash
   curl -X POST https://mossip.example.org/v1/certify/credential \
     -H "Authorization: Bearer <access_token>" \
     -H "Content-Type: application/json" \
     -d '{
       "format": "ldp_vc",
       "credential_configuration_id": "PlaygroundIdentityCredential",
       "proof": { "proof_type": "jwt", "jwt": "<signed_proof_jwt>" }
     }'
   ```
6. Observe HTTP 400 rejection:
   ```json
   {
     "error": "invalid_proof",
     "error_description": "Proof JWT contains invalid audience: expected http://certify-nginx:80/v1/certify but received https://mossip.example.org/v1/certify"
   }
   ```

### Expected Behavior
Inji Certify should honor `X-Forwarded-Host`, `X-Forwarded-Proto`, and `X-Forwarded-Port` headers (or a configured `mosip.certify.public-url` property), accepting audience claims matching the external URL advertised in its `.well-known` discovery document.

### Suggested Fix
In Inji Certify Spring Security / proof validator configuration:
1. Enable Spring Boot forwarded header support in `application.properties`:
   ```properties
   server.forward-headers-strategy=FRAMEWORK
   ```
2. In the audience validator bean, match `aud` against both the request host and any configured `public-issuer-url`.

---

## Issue 3

- **Repository:** [`mosip/inji-verify`](https://github.com/mosip/inji-verify)
- **Title:** `[FEATURE] Add native CBOR parser support for ISO/IEC 18013-5 mDoc (mso_mdoc) in Verifiable Presentations`
- **Labels:** `feature`, `mdoc`, `iso18013-5`, `openid4vp`
- **Severity:** Medium / Standards roadmap alignment

### Description
Inji Verify v0.17 currently rejects `mso_mdoc` presentations submitted via OpenID4VP because `VerifiablePresentationSubmissionServiceImpl.java:88` throws an `InvalidVpTokenException` when attempting to parse the CBOR binary token as JSON or JWT.

### Steps to Reproduce
1. Generate an authentic ISO/IEC 18013-5 Mobile Driving License (mDL) encoded as a base64url CBOR `DeviceResponse`.
2. Post the presentation to Inji Verify via OpenID4VP `POST /v1/verify/vp-submission` with `format: mso_mdoc`.
3. Inji Verify logs:
   ```text
   org.mosip.inji.verify.exception.InvalidVpTokenException: Unable to parse vp_token as JSON or JWT structure
       at org.mosip.inji.verify.service.impl.VerifiablePresentationSubmissionServiceImpl.validateVpToken(VerifiablePresentationSubmissionServiceImpl.java:88)
   ```

### Feature Request
Integrate a CBOR/COSE decoder (e.g. Jackson CBOR or `com.augustcellars.cose`) into `VerifiablePresentationSubmissionServiceImpl`:
1. Detect `format: mso_mdoc` in the incoming submission or presentation definition match.
2. Unpack the `DeviceResponse` structure into `Document` and `IssuerSigned` items.
3. Validate the `IssuerAuth` COSE_Sign1 structure against the issuer's public key certificate.
4. Render extracted namespaces (e.g. `org.iso.18013.5.1`) into the verification result.

---

## Issue 4

- **Repository:** [`mosip/inji-certify`](https://github.com/mosip/inji-certify)
- **Title:** `[ENHANCEMENT] Support pre-authorized_code grant in MOSIP Collab sandbox environments for automated CI/CD testing`
- **Labels:** `enhancement`, `sandbox`, `collab`, `dx`, `ci-cd`
- **Severity:** Medium / Developer Experience friction

### Description
The hosted MOSIP Collab Inji Certify sandboxes (`certify-mock`, `certify-farmer`, `certify-mosipid`) currently only expose `grant_types_supported: ["authorization_code"]`. They lack the `pre-authorized_code` grant defined in OpenID4VCI draft 13 §4.1.1.

### Impact
External developer teams, third-party wallet integrators, and automated CI/CD testing harnesses cannot run nightly automated tests against Collab sandboxes because issuing a credential requires an interactive browser session to solve an SMS/Email OTP challenge via eSignet.

### Enhancement Request
1. Enable `urn:ietf:params:oauth:grant-type:pre-authorized_code` in Collab Inji Certify mock instances.
2. Expose a public pre-authorized offer creation endpoint (e.g. `GET /v1/certify/credential-offer?type=PlaygroundIdentityCredential`) that returns a short-lived `pre-authorized_code` for automated testbeds.
