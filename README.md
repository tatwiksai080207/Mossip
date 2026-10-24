# Interop Studio

A Unified Cross-Ecosystem Conformance Testbed, Wire Protocol Inspector, and Interoperability Sandbox for Verifiable Credentials across the MOSIP Inji Ecosystem (Inji Certify, Inji Mobile Wallet, Inji Web, Inji Verify), walt.id, and Sphereon.

Built for MOSIP Decode 2026 Problem Statement 02 (High Complexity).

---

## Table of Contents
- [Overview](#overview)
  - [End-to-End Workflow](#end-to-end-workflow)
  - [Key Strengths](#key-strengths)
- [Key Features](#key-features)
  - [Mandatory Requirements Completed](#mandatory-requirements-completed)
  - [Advanced Tasks Completed](#advanced-tasks-completed)
  - [Bonus Goals Achieved](#bonus-goals-achieved)
- [Supported Standards](#supported-standards)
  - [Supported Credential Formats](#supported-credential-formats)
  - [Cryptographic Suites and Algorithms](#cryptographic-suites-and-algorithms)
  - [Protocols and Query Formats](#protocols-and-query-formats)
  - [Integrated Ecosystem Platforms](#integrated-ecosystem-platforms)
- [Quick Start](#quick-start)
  - [Prerequisites](#prerequisites)
  - [Quick Start (No Docker Required)](#quick-start-no-docker-required)
  - [Starting the Local MOSIP Stack](#starting-the-local-mosip-stack)
  - [Single Command Docker Setup](#single-command-docker-setup)
  - [Testing with Inji Mobile App](#testing-with-inji-mobile-app)
  - [Common Commands](#common-commands)
- [Component Overview](#component-overview)
  - [Project Structure](#project-structure)
  - [Core Modules](#core-modules)
- [Configuration and Environment Guide](#configuration-and-environment-guide)
  - [Configuration Files Reference](#configuration-files-reference)
  - [Custom Resident UIN Configuration](#custom-resident-uin-configuration)
  - [Google OAuth Authentication (Optional)](#google-oauth-authentication-optional)
- [Interoperability Issues and Solutions](#interoperability-issues-and-solutions)
- [Testing and Verification](#testing-and-verification)
  - [Automated Test Results (53 Tests across 10 Suites)](#automated-test-results-53-tests-across-10-suites)
- [Documentation Index](#documentation-index)

---

## Overview

Interop Studio is a comprehensive interoperability testing playground, conformance testbed, and wire protocol inspector purpose-built for decentralized verifiable credential ecosystems. Designed in strict alignment with MOSIP Decode 2026 Problem Statement 02 (High Complexity), the platform enables developers, system integrators, and auditors to configure, execute, inspect, and benchmark end-to-end credential lifecycles across MOSIP Inji modules and independent external standards implementations.

### End-to-End Workflow

The platform orchestrates the full verifiable credential trust triangle (Issuer, Holder/Wallet, Verifier) through a six-stage operational pipeline:

1. **Role and Target Selection**:
   - The user selects which implementation acts as the Issuer (Inji Certify, Playground Mock, walt.id, or Sphereon), the Wallet (Inji Mobile via QR, Inji Web, Playground Headless, walt.id, or Sphereon), and the Verifier (Inji Verify, walt.id, or Sphereon).
   - Environment status indicators confirm whether target services are local, containerized, cloud sandbox, or simulated.

2. **Format and Policy Configuration**:
   - The user configures the target credential format: W3C VC 1.1 JSON-LD, W3C VC 2.0 JSON-LD, IETF SD-JWT VC, or ISO/IEC 18013-5 mDoc.
   - The user selects the execution mode: Normal (cryptographically valid) or Tamper Mode (Corrupt Signature, Expired Timestamp, Invalid Schema Type).

3. **OpenID4VCI Credential Issuance Walk**:
   - The playground triggers OpenID4VCI discovery (`/.well-known/openid-credential-issuer` and `/.well-known/oauth-authorization-server`).
   - Obtains an issuance offer via pre-authorized code grant or interactive OIDC eSignet PKCE authorization with resident/farmer personas.
   - The wallet generates an ephemeral or persisted cryptographic keypair and produces an `openid4vci-proof+jwt` proof-of-possession token bound to the issuer's challenge nonce.
   - The issuer validates proof cryptography, issues the credential in the requested format, and delivers it to the wallet.

4. **OpenID4VP Presentation and Verification**:
   - The verifier initiates an OpenID4VP request specifying requirements via DCQL v2 or DIF Presentation Exchange v2.
   - For physical mobile testing, an OpenID4VP QR code is rendered on screen with a public reverse-tunnel endpoint.
   - The wallet signs a Verifiable Presentation (`vp_token`) bound to the verifier's challenge nonce and audience.
   - The verifier validates the cryptographic signature, checks holder key binding, evaluates expiration, and produces an authoritative verification verdict (Valid, Invalid, Expired).

5. **Real-Time Protocol Visualization and Wire Inspection**:
   - The platform smoothly auto-scrolls to the protocol visualization area upon execution.
   - An interactive Mermaid sequence diagram renders each request-response step in real time.
   - Developers can click any step in the flow progress timeline to inspect the raw wire payloads (headers, tokens, proof JWTs, disclosures, DCQL queries, and JSON responses).

6. **Matrix Telemetry and Regression Recording**:
   - Every execution is evaluated for overall pass/fail status and logged into a persistent local history datastore.
   - The result dynamically updates the 2D Interoperability Matrix grid and detailed table, tracking multi-version compatibility.

### Key Strengths

- **True Cross-Ecosystem Scope**: Interoperates not just across Inji internal modules, but across premier external open-standards engines: walt.id and Sphereon (European Digital Identity / EUDI).
- **Four Production Credential Formats**: Full native handling of W3C VC 1.1, W3C VC 2.0, IETF SD-JWT VC, and ISO/IEC 18013-5 mDoc.
- **Zero-Docker Instant Mode**: Launches the entire studio with mock issuers, simulated eSignet IdP, interactive browser wallet, and external bridges in 10 seconds without requiring Docker.
- **Physical Smartphone Testing**: Built-in reverse-tunnel manager allowing physical Android and iOS devices running the official Inji Mobile Wallet app to scan live QR codes.
- **Negative Security and Tamper Engine**: Built-in deterministic mutation engine enabling testing of invalid signatures, expired tokens, and schema corruption.
- **Dual Presentation Query Dialects**: Automatically bridges and translates between Inji Verify DCQL v2 and DIF Presentation Exchange v2.

---

## Key Features

### Mandatory Requirements Completed

All mandatory requirements from the MOSIP Inji Problem Statement 02 have been successfully implemented and verified:

| Task | Problem Statement Requirement | Implementation in Interop Studio | Status |
|---|---|---|:---:|
| **Core Inji Stack Setup** | Stand up core Inji Stack locally / in MOSIP Collab sandbox: Inji Certify (issuer), Mimoto + Inji Wallet or Inji Web (holder), Inji Verify (verifier) connected end-to-end. | Complete Docker Compose stack in `mosip-stack/` (Postgres, Certify, Verify, Mimoto, Web) plus live connectivity to the MOSIP Collab Cloud Sandbox (`certify-mosipid`, `injiverify`, `esignet`). | Delivered |
| **3-Column Role Selector** | Build a playground UI with a 3-column "Issuer -> Wallet -> Verifier" selector letting user pick implementations for each role. | Responsive 3-column selector allowing arbitrary matrix configuration across Inji, walt.id, Sphereon, and Mock modules with real-time environment status badges. | Delivered |
| **Live Credential Issuance** | Trigger Inji Certify to issue a VC via OpenID4VCI to a selected wallet, showing credential offer, token exchange, and issued credential in UI. | End-to-end 7-step OpenID4VCI walk supporting both automated pre-authorized code grant and interactive OIDC PKCE eSignet consent flow with live payload inspection. | Delivered |
| **Live Present and Verify** | From the wallet, share credential via OpenID4VP to Inji Verify and display verification result (Valid / Invalid / Valid-but-Expired). | Complete OpenID4VP presentation pipeline via cross-device QR flow or in-browser wallet to Inji Verify, showing schema, signature, and expiration check verdicts. | Delivered |
| **Protocol Inspector Panel** | Add protocol inspector panel showing raw exchanged payloads at each step (auth request, offer, vp_token, presentation_definition, verification JSON). | Expandable wire protocol inspector providing instant visibility into exact headers, OAuth parameters, proof JWTs, decrypted claims, and verification JSON. | Delivered |
| **Multi-Format Support** | Support at least two credential formats end-to-end (e.g. W3C VC JSON-LD and SD-JWT VC) with clear runtime labeling per test run. | Supports four credential formats: W3C VC 1.1 JSON-LD, W3C VC 2.0 JSON-LD, IETF SD-JWT VC, and ISO/IEC 18013-5 mDoc, with prominent format badges throughout UI. | Delivered |
| **Interoperability Report** | Produce a pass/fail interoperability report per test run (issuer, wallet, verifier, format, proof type, outcome, error detail if failed). | Generates comprehensive run reports, detailed exportable test results, and a dedicated 2D compatibility matrix tracking all permutations. | Delivered |

### Advanced Tasks Completed

All good-to-have tasks from Problem Statement 02 have been completed:

| Task | Problem Statement Requirement | Implementation in Interop Studio | Status |
|---|---|---|:---:|
| **External Non-Inji Implementations** | Extend wallet/verifier matrix to include at least one non-Inji, standards-compliant mock (OpenID4VCI issuer or OpenID4VP verifier). | Integrated two premier external implementations: walt.id (OpenID4VCI issuer and OpenID4VP verifier) and Sphereon (EUDI issuer, DIF PEX v2 verifier, and wallet). | Completed |
| **mDoc / mDL Credential Format** | Add mDoc/mDL (ISO/IEC 18013-5) as a third credential format using Inji Certify mock mDoc support. | Native ISO/IEC 18013-5 engine supporting CBOR encoding, Mobile Security Object (MSO) generation, and COSE_Sign1 signature verification. | Completed |
| **Animated Sequence Diagram** | Visualise OpenID4VP sequence as an animated/interactive Mermaid sequence diagram rather than a static log. | Dynamic Mermaid sequence visualizer with Full Lifecycle and OpenID4VP Focus views, illuminating step-by-step as requests transact on the wire. | Completed |
| **Replay and Tamper Mode** | Add "replay & tamper" mode letting users deliberately corrupt a VC/VP (wrong type, expired, bad signature) to demonstrate negative-path handling. | Dedicated Tamper Engine with three mutation vectors: Corrupt Signature (bitflip inversion), Expired Timestamp, and Invalid Schema Type. | Completed |
| **Historical Test Dashboard** | Build a historical dashboard of past interoperability runs with filters by module version, format, and outcome for regression tracking. | Interactive Run History dashboard with multi-criteria filtering by date range, credential format, target environment, and pass/fail verdict. | Completed |
| **Same-Device OpenID4VP Flow** | Support OpenID4VP Same-Device flow via deep link / Digital Credentials API in addition to cross-device QR flow. | Supports both same-device direct post / deep-link invocation and cross-device QR presentation with public reverse-tunnel resolution. | Completed |

### Bonus Goals Achieved

All bonus objectives outlined in the hackathon brief have been addressed:

| Task | Problem Statement Requirement | Implementation in Interop Studio | Status |
|---|---|---|:---:|
| **Automated CI Test Suite** | Automate playground as a CI-style interoperability test suite that can run nightly against Collab and post a matrix. | 53 automated Vitest unit and integration tests across 10 suites (`npm test`) plus headless CLI conformance runners (`npm run check:suite`). | Delivered |
| **Upstream Gap Contributions** | Contribute discovered interoperability gaps back as issues/documentation to the relevant mosip/inji-* repositories. | Documented 6 real-world upstream friction points with exact payloads, error stacktraces, and architectural workarounds in the Interoperability Report. | Delivered |
| **Telemetry and Observability** | Add telemetry/observability to track success rates and latency per flow. | Real-time WebSocket event bus (`/ws/telemetry`), live sandbox health probe (`/api/diagnostics`), and per-step timing benchmarks. | Delivered |
| **One-Command Docker Bundle** | Package the whole playground as a one-command Docker Compose bundle so any developer can spin it up locally in minutes. | Production-optimized Dockerfile and Compose bundle (`docker compose up --build`) building Vite SPA and serving via Express BFF in a single command. | Delivered |

---

## Supported Standards

### Supported Credential Formats
- **W3C VC 1.1 (JSON-LD)**: URDNA2015 canonical dataset normalization, `Ed25519Signature2020` proof suite, and `did:key` holder binding.
- **W3C VC 2.0 (JSON-LD)**: Modern W3C Data Model v2.0 with inlined context and assertion method verification.
- **IETF SD-JWT VC**: Compact salted disclosure serialization (`draft-ietf-oauth-sd-jwt-vc`), `ES256` ECDSA signing, and Key Binding JWT (`kb+jwt`) with `sd_hash`.
- **ISO/IEC 18013-5 mDoc (mDL)**: Binary CBOR data structure, Mobile Security Object (MSO), and COSE_Sign1 signature authentication.

### Cryptographic Suites and Algorithms
- **Ed25519 / EdDSA**: `Ed25519Signature2020` using multicodec prefix `0xed01`.
- **ECDSA P-256 (secp256r1)**: `ES256` for SD-JWT issuer signatures, holder proof-of-possession, and Key Binding JWTs.
- **COSE Algorithms**: Algorithm `-7` (ES256) for ISO 18013-5 mDoc signatures.
- **Decentralized Identifiers (DIDs)**: Native support for `did:key` and `did:jwk`.

### Protocols and Query Formats
- **OpenID4VCI**: Conformance with draft 13 and draft 15 (metadata discovery, pre-authorized code grant, authorization code grant with PKCE, `openid4vci-proof+jwt`, `c_nonce` lifecycle).
- **OpenID4VP**: Conformance with draft 21-23 (direct post response mode, cross-device QR flow, request by reference via `request_uri`).
- **Query Dialects**: Digital Credentials Query Language (DCQL v2) and DIF Presentation Exchange v2 (PEX v2 input descriptors).

### Integrated Ecosystem Platforms
- **MOSIP Inji Stack**: Inji Certify (Spring Boot), Inji Mobile Wallet (React Native), Inji Web (React), Inji Verify (Spring Boot), and Mimoto (Java BFF).
- **walt.id**: OpenID4VCI issuer bridge and OpenID4VP DIF PEX relying party verifier.
- **Sphereon**: EUDI reference issuer (PID, Diploma, EHIC), DIF PEX v2 verifier, and independent holder wallet.

---

## Quick Start

### Prerequisites
- **Node.js**: Version 18.0.0 or higher (tested on Node 20 LTS and Node 24 LTS)
- **npm**: Version 9.0.0 or higher
- **Docker and Docker Compose**: *(Optional)* Required only if executing against the local containerized MOSIP stack.

---

### Quick Start (No Docker Required)

Clone the repository and launch both the frontend UI and backend orchestrator concurrently:

```bash
git clone https://github.com/your-username/inji-playground.git
cd inji-playground
npm install
npm run dev:all
```

- **Frontend Interop Studio**: Access at `http://localhost:3000`
- **Backend BFF Orchestrator**: Running on `http://localhost:3001`

*The playground starts immediately with all mock issuers, simulated eSignet IdP, interactive browser wallet, and external walt.id/Sphereon engines ready to test.*

---

### Starting the Local MOSIP Stack

To test against local containerized MOSIP backend services rather than mock engines or the cloud sandbox:

```bash
cd mosip-stack
docker compose up -d
cd ..
```

*Spins up PostgreSQL (port 5433), Inji Certify (port 8090/8091), Mimoto (port 8099), Inji Verify (port 8095), and Inji Web (port 3004).*

---

### Single Command Docker Setup

To build and run the entire playground (BFF orchestrator serving the production-built Vite SPA) in a single container:

```bash
docker compose up --build
```

- Access the studio at `http://localhost:3001`

---

### Testing with Inji Mobile App

To issue credentials directly to or verify credentials from an actual smartphone running Inji Mobile:

1. **Start an Ngrok Reverse Tunnel** exposing port 3001:
   ```bash
   ngrok http 3001
   ```
2. **Synchronize the Tunnel URL** in the studio header or via curl:
   ```bash
   curl -X POST http://localhost:3001/api/tunnel \
     -H "Content-Type: application/json" \
     -d '{"tunnelUrl":"https://<your-subdomain>.ngrok-free.dev"}'
   ```
3. **Configure the Inji Mobile App**:
   - Open Inji Mobile on your phone and navigate to Settings -> Advanced / Developer Options.
   - Set **eSignet Host**: `https://esignet-mosipid.collab.mosip.net`
   - Set **Credential Registry**: Your Ngrok public URL.
4. **Scan and Test**: Select Inji Mobile as the wallet in the studio, click "Run Test", and scan the displayed QR code with your phone camera.

---

### Common Commands

```bash
# Run all 53 automated unit and integration tests
npm test

# Run multi-format cryptographic conformance checks against live Inji Verify
npm run check:suite

# Run 7-step OpenID4VCI draft-13 conformance walk
npx tsx scripts/check-issuance.ts

# Strict TypeScript compiler verification
npm run typecheck

# Fast code linting
npm run lint

# Production bundle build
npm run build
```

---

## Component Overview

### Project Structure

```text
inji-playground/
├── docs/                                # Technical specifications and reports
│   ├── API_DOCUMENTATION.md             # REST API reference (25+ endpoints)
│   ├── INTEROPERABILITY_REPORT.md       # Compliance matrix & 6 upstream friction points
│   ├── TEST_CASES_AND_RESULTS.md        # 53 automated test results & test matrices
│   ├── TEST_DATA.md                     # Personas, keys, wire payloads & vectors
│   ├── ARCHITECTURE_AND_FLOWS.md        # Mermaid sequence diagrams & specifications
│   └── inji_ecosystem_flow.md           # Foundational SSI & Inji stack guide
├── mosip-stack/                         # Local MOSIP Docker infrastructure
│   ├── docker-compose.yaml              # Compose file (Postgres, Certify, Verify, Mimoto)
│   └── config/                          # Issuer and verifier configuration mounts
├── server/                              # Express 5 BFF Orchestrator & Cryptographic Engines
│   ├── formats/                         # Format encoders and decoders
│   │   ├── ldp.ts                       # W3C VC 1.1 / 2.0 (Ed25519Signature2020)
│   │   ├── sd-jwt.ts                    # IETF SD-JWT VC (ES256 + disclosures + kb-jwt)
│   │   └── mdoc.ts                      # ISO/IEC 18013-5 mDoc (CBOR + COSE_Sign1)
│   ├── oidc/                            # Mock eSignet Identity Provider
│   │   ├── profiles.ts                  # Resident and farmer identity definitions
│   │   └── consent-template.ts          # Interactive consent UI template
│   ├── external/                        # External reference implementation bridges
│   │   ├── waltid-issuer.ts             # walt.id OpenID4VCI issuer mock
│   │   ├── waltid.ts                    # walt.id OpenID4VP verifier mock
│   │   ├── sphereon-issuer.ts           # Sphereon EUDI OpenID4VCI issuer mock
│   │   ├── sphereon-verifier.ts         # Sphereon OpenID4VP DIF PEX verifier mock
│   │   └── sphereon-wallet.ts           # Sphereon reference holder wallet
│   ├── routes/                          # Modular domain controllers
│   │   ├── certify-routes.ts            # Certify proxy and metadata caching
│   │   ├── mimoto-routes.ts             # Mimoto router and bridge delegation
│   │   ├── mimoto/                      # DB bridge, PDF generator, presentation bridge
│   │   ├── verifier-routes.ts           # Inji Verify proxy and DCQL engine
│   │   ├── wallet.ts                    # Headless wallet execution endpoints
│   │   └── diagnostics-routes.ts        # Upstream sandbox health monitoring
│   ├── wallet/                          # Headless holder engine
│   │   ├── issuance.ts                  # Automated OpenID4VCI walk
│   │   └── presentation.ts              # OpenID4VP presentation signer
│   ├── keys.ts                          # DID:key and JWK generators (Ed25519, P-256)
│   ├── tamper.ts                        # Deterministic corruption & mutation engine
│   ├── tunnel.ts                        # Ngrok / Cloudflare reverse tunnel manager
│   └── index.ts                         # Express server bootstrap (Port 3001)
├── src/                                 # Frontend React 18 Application (Vite, port 3000)
│   ├── components/                      # Modular UI components
│   │   ├── config/                      # 3-Column RoleSelector (Issuer -> Wallet -> Verifier)
│   │   ├── flow/                        # SequenceDiagram, FlowProgress, Interactive modals
│   │   ├── reporting/                   # InteropMatrix, RunHistory, TestReport
│   │   │   └── matrix/                  # MatrixGridView, MatrixTableView, types
│   │   └── layout/                      # Header, Sidebar, ThemeSelector
│   ├── store/                           # Reactive state management (Zustand)
│   │   ├── store.ts                     # Main reactive store
│   │   ├── flow-runner.ts               # Protocol step execution engine
│   │   └── evaluator.ts                 # Flow status evaluator
│   ├── themes/                          # Theme engine (Linear Obsidian default)
│   └── main.tsx                         # React entry point
├── tests/                               # Automated Vitest test suites (53 tests, 10 suites)
└── scripts/                             # Conformance test scripts
```

### Core Modules

- **Interop Studio UI (`src/`)**: A modular React 18 application built with Vite. Houses the 3-column matrix selector, real-time Mermaid sequence visualizer, wire protocol inspector, interactive wallet modal, and 2D interoperability matrix.
- **BFF Orchestrator (`server/index.ts`)**: An Express 5 gateway coordinating proxying, protocol translation, metadata caching, and WebSocket event telemetry.
- **Cryptographic Engines (`server/formats/`)**: Standalone implementations of W3C VC 1.1/2.0 (`ldp.ts`), IETF SD-JWT VC (`sd-jwt.ts`), and ISO 18013-5 mDoc (`mdoc.ts`).
- **Simulated eSignet IdP (`server/oidc/`)**: An in-memory OAuth 2.0 PKCE provider simulating MOSIP's eSignet, complete with resident and farmer identity profiles and an interactive consent screen.
- **Mimoto Bridge (`server/routes/mimoto/`)**: Enables direct PostgreSQL credential injection for Inji Web and on-the-fly generation of cryptographically watermarked credential PDFs.
- **External Engines (`server/external/`)**: Dedicated OpenID4VCI and OpenID4VP bridges matching walt.id and Sphereon EUDI specifications.
- **Tamper Engine (`server/tamper.ts`)**: Deterministic bitflip and payload corruptor for rigorous negative security testing.

---

## Configuration and Environment Guide

### Configuration Files Reference

The repository provides modular, centralized configuration files organized by subsystem:

| Configuration File | Subsystem & Scope | Purpose and Modifiable Settings |
|:---|:---|:---|
| `server/config/identities.json` | Mock & Collab Personas | Defines resident identity (`uin`, `fullName`, `dateOfBirth`, `gender`, `phone`), farmer identity (`farmerId`, crops, land area), and driving license. Edit this file to insert your personal UIN or custom claims. |
| `server/config/env.ts` | Backend Server Runtime | Central configuration for ports (`PORT`, `VITE_PORT`), upstream Collab endpoints (`COLLAB_CERTIFY_URL`, `COLLAB_VERIFY_URL`), local Docker URLs (`LOCAL_CERTIFY_URL`), Postgres DB credentials, and secrets. |
| `server/config/keys.json` | Backend Cryptography | Static verifier key identifiers (`kid`), Collab certificate paths, and Keycloak mock roles/tokens. |
| `server/config/sphereon-identities.json` | External Sphereon Suite | EUDI test identities for European PID (Alice Martin), Higher Education Diploma, and EHIC credentials. |
| `src/config/matrix.json` | Frontend Reporting | Baseline matrix data, supported credential configurations, and historical test outcomes. |
| `src/config/app-links.json` | Frontend UI | External download links including Inji Mobile APK and repository references. |
| `mosip-stack/config/env-config.js` | Containerized Inji Web | Runtime configuration injected into Inji Web container (`/usr/share/nginx/html/env.config.js`). Configures Inji Web API endpoints, Mimoto URL, and optional Google Client ID. |
| `mosip-stack/config/mimoto-default.properties` | Containerized Mimoto | Spring Boot properties for Mimoto container (DB connections, Keycloak, eSignet endpoints, trusted issuers, and Google OAuth parameters). |
| `mosip-stack/config/mimoto-issuers-config.json` | Mimoto / Inji Web | Registry of issuers displayed in Inji Web / Mobile for credential download. |
| `mosip-stack/config/mimoto-trusted-verifiers.json` | Mimoto / Inji Web | Registry of trusted relying parties and verifiers for OpenID4VP presentations. |
| `mosip-stack/config/certify-default.properties` | Containerized Inji Certify | Spring Boot configuration for local Inji Certify (database, signing key seeds, and plugin registrations). |
| `mosip-stack/config/farmer_identity_data.csv` | Inji Certify Plugin | Mock CSV dataprovider records for Inji Certify farmer issuance plugin. |

### Custom Resident UIN Configuration

To test live end-to-end credential issuance and authentication against the public MOSIP Collab Cloud Sandbox (`collab.mosip.net`), any tester, evaluator, or developer can register their own identity and receive real-time OTP emails directly in their inbox:

1. **Self-Register on MOSIP Collab**: Visit the public registration portal at [https://self-register.collab.mosip.net/](https://self-register.collab.mosip.net/).
2. **Submit Your Details**: Provide your name, date of birth, gender, and personal email. Complete email verification.
3. **Receive Your Unique UIN**: The portal assigns you a fresh 10-digit MOSIP UIN (e.g. `1111222233`) bound to your email address.
4. **Set Your UIN in the Playground**:
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
   - Option B: Set environment variables `RESIDENT_UIN=1111222233`, `RESIDENT_FULL_NAME="Your Name"`, and `RESIDENT_PHONE="Your Phone"`.
   - Option C: Update `server/config/identities.json` directly.
5. **Test Live OTP Authentication**: In Interop Studio, select `Inji Certify (Collab)` or `eSignet OIDC`. When the authentication prompt opens, submit your UIN. MOSIP eSignet will dispatch the real-time OTP directly to your registered email address.

*(Note: For immediate zero-setup evaluation without creating a MOSIP Collab account, select the built-in **Playground Mock Issuer** and mock mode where test OTP `111111` is accepted instantly without external network or email dependencies).*

### Google OAuth Authentication (Optional)

A common question when testing Inji Web is whether Google OAuth credentials are required:

- **Is Google OAuth Required to Use the Playground?**
  **No.** The built-in **In-Browser Wallet** (Playground Wallet) requires **zero Google OAuth** and **zero external accounts**.
- **Is Google OAuth Required for Local Inji Web?**
  **No.** The local Inji Web container (`http://localhost:3004`) supports **eSignet / MOSIP ID** and mock Keycloak authentication without Google OAuth. Furthermore, the playground's Mimoto DB Bridge (`server/routes/mimoto/db-bridge.ts`) can inject credentials directly into Inji Web's PostgreSQL database without any login step.
- **Enabling Google Sign-In for Inji Web (Optional)**:
  If you specifically wish to test Inji Web's optional "Sign in with Google" button:
  1. Create an OAuth 2.0 Web Client ID in the Google Cloud Console.
  2. Set the authorized redirect URI to `http://localhost:8099/v1/mimoto/oauth2/callback/google`.
  3. Set the authorized JavaScript origin to `http://localhost:3004`.
  4. Provide the credentials in `mosip-stack/docker-compose.yaml` (or via environment variables):
     ```yaml
     - GOOGLE_OAUTH_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
     - GOOGLE_OAUTH_CLIENT_SECRET=your-google-client-secret
     ```

---

## Interoperability Issues and Solutions

Cross-testing multiple independent implementations uncovered six significant upstream friction points in digital identity specifications:

| # | Challenge | Observed Behavior | Architectural Solution Implemented |
|:---:|---|---|---|
| **1** | **OpenID4VCI Sandbox Grant Mismatch** | Hosted MOSIP Collab Certify instances only advertise `authorization_code`, blocking automated headless CI testbeds without interactive human login. | Implemented a dual-mode engine: interactive OIDC eSignet PKCE simulation for human testing, plus a conformant `pre-authorized_code` (draft 13) mock issuer for automated CI. |
| **2** | **Certify Docker Nginx Audience Rewriting** | Inji Certify behind Docker Nginx strictly checks the proof `aud` claim against the internal container host, rejecting external tunnel URLs used by mobile wallets. | BFF proxy intercepts discovery and injects `_internal_credential_issuer`; the wallet signs the proof JWT with the internal audience expected by Certify. |
| **3** | **Inji Verify SD-JWT Strict X.509 Requirement** | Inji Verify fails with `getX509CertChain() must not be null` when verifying SD-JWT VCs signed with decentralized `did:key`/`did:jwk`. | Implemented local cryptographic verification (checking disclosures and KB-JWT against `did:key`) while routing X.509 tokens to Inji Verify. |
| **4** | **DCQL v2 vs Presentation Exchange Divergence** | Inji Verify prioritizes DCQL v2, whereas external engines (Sphereon and walt.id) mandate DIF Presentation Exchange v2 with JSONPath constraints. | Dynamic query synthesizer normalizes presentation requests across both DCQL v2 and DIF PEX v2 dialects. |
| **5** | **Mobile QR Payload Density Limits** | Embedding full JSON-LD credentials directly into QR codes exceeds camera decoding resolution on standard smartphones. | Implemented OpenID4VP *Request by Reference* (`request_uri`), transmitting a compact pointer in the QR code and streaming data over HTTP. |
| **6** | **Proof Canonicalization Discrepancies** | Minor normalization discrepancies between Digital Bazaar URDNA2015 RDF normalizers and non-RDF external normalizers. | Inlined self-contained `@context` vocabularies to ensure 100% offline mathematical reproducibility across all environments. |

---

## Testing and Verification

### Automated Test Results (53 Tests across 10 Suites)

All 53 automated unit and integration tests execute cleanly with a 100% pass rate:

```text
Test Suites: 10 passed, 10 total
Tests:       53 passed, 53 total
Snapshots:   0 total
Time:        10.70s
```

| Test Suite File | Tests | Focus Area | Status |
|---|:---:|---|:---:|
| `tests/sphereon.test.ts` | 7 | Sphereon EUDI Issuer, Verifier, and Wallet Interoperability | Passed |
| `tests/waltid.test.ts` | 7 | walt.id OpenID4VCI Issuer and OpenID4VP DIF PEX Verifier | Passed |
| `tests/oidc.test.ts` | 8 | OIDC Discovery, PKCE Exchange, and Consent Simulation | Passed |
| `tests/formats.test.ts` | 6 | W3C VC 1.1/2.0, SD-JWT VC, and ISO 18013-5 mDoc Encoders | Passed |
| `tests/mimoto.test.ts` | 6 | Mimoto DB Credential Injection & Dynamic PDF Generation | Passed |
| `tests/tamper.test.ts` | 6 | Deterministic Bitflip, Expired Token & Negative Path Checks | Passed |
| `tests/keys.test.ts` | 4 | Ed25519 `did:key` and ECDSA P-256 JWK Derivation | Passed |
| `tests/providers.test.ts` | 4 | Dynamic Provider Registry and Factory Abstraction | Passed |
| `tests/diagnostics.test.ts` | 2 | Upstream MOSIP Sandbox Health and Latency Monitoring | Passed |
| `tests/issuance.test.ts` | 3 | End-to-End 7-step OpenID4VCI Issuance Conformance | Passed |

---

## Documentation Index

| Document | Purpose | Target Audience |
|---|---|---|
| **[API Documentation](docs/API_DOCUMENTATION.md)** | Complete reference for all 25+ BFF endpoints with schemas and cURL examples. | Developers, API Integrators |
| **[Interoperability Report](docs/INTEROPERABILITY_REPORT.md)** | Format compliance matrix, cross-ecosystem results, and 6 upstream friction points. | Evaluators, MOSIP Maintainers |
| **[Test Cases and Results](docs/TEST_CASES_AND_RESULTS.md)** | Formal 53-test execution matrix, preconditions, inputs, and actual results. | QA Engineers, Security Auditors |
| **[Test Data Catalog](docs/TEST_DATA.md)** | Personas, cryptographic keys, sample wire payloads for all 4 formats, and tamper vectors. | Developers, Testers |
| **[Architecture and Protocol Flows](docs/ARCHITECTURE_AND_FLOWS.md)** | End-to-end Mermaid sequence diagrams for OIDC4VCI, OIDC4VP, and cross-ecosystem flows. | System Architects, Integrators |
| **[Inji Ecosystem Guide](docs/inji_ecosystem_flow.md)** | Conceptual overview of SSI, asymmetric cryptography, and the MOSIP Inji stack. | New Learners, General Audience |
