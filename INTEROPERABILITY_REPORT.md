# Interoperability Report: Local Inji Certify

## Overview
We've successfully fixed the end-to-end credential issuance and verification flow using the **Local Inji Certify** issuer, **Inji Web** wallet, and **Inji Verify** verifier. The entire OpenID4VCI (Issuance) and OpenID4VP (Presentation) protocol sequence now completes flawlessly (7/7 steps passed).

## What Was Failing & Why?
The flow was previously failing during **Credential Issuance (Step 4)** with an `invalid_credential_request` error, and the OIDC popup for eSignet authentication was not redirecting properly. Here's a breakdown of the root causes:

1. **Proof of Possession `aud` Claim Mismatch**
   - **The Problem:** The wallet was sending a proof JWT bound to the external URL (`http://localhost:3001/api/local-certify`), but the Local Certify service (running inside Docker) strictly validates the `aud` claim against its own internal URL (`http://certify-nginx:80`).
   - **The Fix:** We updated the BFF's metadata proxy to inject a special `_internal_credential_issuer` field into the `.well-known` discovery document. The wallet now detects this and intelligently binds the proof JWT to the correct internal URL, satisfying Certify's strict validation.

2. **Strict Credential Definition Validation**
   - **The Problem:** Certify v0.14.0 uses a strict Jackson JSON parser. We were initially trying to strip out fields like `@context` and `credentialSubject` from the `credential_definition` in the request body, thinking Certify would reject unknown fields. However, Certify's schema actually *requires* these fields to be present and match the exact structure advertised in its metadata.
   - **The Fix:** We restored the code in `wallet.ts` to send the complete `credential_definition` object (including `@context`, `type`, and `credentialSubject`) exactly as discovered from Certify's `.well-known` metadata. 

3. **OIDC Callback & Frontend Dev Server**
   - **The Problem:** When the eSignet popup completed authentication, it attempted to redirect to the `/callback` route. However, the frontend was not built, and the BFF server was only serving a blank or missing `dist/` folder, causing the popup to hang and fail to pass the `code` back to the parent window.
   - **The Fix:** We fixed a few TypeScript type errors (`CryptoKey` and `alg: 'RS256' vs 'ES256'`), successfully built the React frontend using Vite (`npm run build`), and restarted the BFF server to correctly serve the static UI assets.

## Current State
- ✅ **Issuer Metadata Discovery:** Working.
- ✅ **Credential Offer:** Working.
- ✅ **Token Exchange (eSignet OIDC):** Working via interactive popup.
- ✅ **Credential Issuance:** Working. Certify now accepts the credential request and issues the VC.
- ✅ **VP Authorization Request:** Working.
- ✅ **VP Token Response:** Working.
- ✅ **Verification Result:** Working. Inji Verify successfully validates the presentation.

The playground is fully operational! If you have any other scenarios to test or new components to integrate, just let me know.
