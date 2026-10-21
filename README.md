# Inji Interoperability Playground

An automated, cross-platform interoperability testing playground and protocol inspector for Verifiable Credentials across the **MOSIP Inji ecosystem** (Inji Certify, Inji Wallet, Inji Web, Inji Verify, and external reference implementations like walt.id).

---

## 📖 Key Documentation
* **[Interoperability Report & Upstream Gaps](docs/INTEROPERABILITY_REPORT.md)**: Full compliance matrix across all 4 credential formats, negative testing validation, and 6 documented upstream issues.
* **[Ecosystem Architecture & Sequence Flows](docs/inji_ecosystem_flow.md)**: Detailed technical specifications for OpenID4VCI draft 13, OpenID4VP DCQL v2, and ISO 18013-5 mDoc protocols.

---

## 🏗️ Repository Architecture

```text
inji-playground/
├── docs/                      # Comprehensive technical reports & architecture specs
│   ├── INTEROPERABILITY_REPORT.md
│   ├── inji_ecosystem_flow.md
│   └── AGENT_HANDOFF.md
├── mosip-stack/               # Local MOSIP Docker infrastructure (Postgres, Certify, Verify, Mimoto, Inji Web)
│   ├── docker-compose.yaml
│   └── config/
├── server/                    # Backend BFF Proxy & Headless Cryptographic Engines
│   ├── formats/               # W3C VC 1.1/2.0 (LDP), SD-JWT VC, ISO 18013-5 mDoc
│   ├── external/              # walt.id OpenID4VCI issuer & OpenID4VP verifier
│   ├── issuer.ts              # Headless OpenID4VCI mock issuer
│   ├── wallet.ts              # Headless holder engine & presentation signer
│   └── index.ts               # Express BFF router & telemetry bus (port 3001)
├── src/                       # Frontend React 18 Application (Vite, port 3000)
│   ├── components/            # Clean domain-grouped UI components
│   │   ├── layout/            # Header
│   │   ├── config/            # RoleSelector (Issuer / Wallet / Verifier)
│   │   ├── flow/              # SequenceDiagram, FlowProgress, InteractiveAuthModal
│   │   ├── verification/      # InjiVerifyPanel (Official SDK integration)
│   │   ├── reporting/         # RunHistory (Regression Dashboard), InteropMatrix, TestReport
│   │   └── index.ts           # Central barrel export
│   ├── config.ts              # Credential types & entity configurations
│   ├── store.ts               # Zustand reactive store & run evaluations
│   └── history-data.ts        # Multi-release baseline regression test data
└── scripts/
    └── check-suite.ts         # Automated CLI conformance test suite
```

---

## 🚀 Quick Startup Guide

### Prerequisites
* **Node.js**: v18+ (tested on v20 & v24)
* **npm**: v9+
* **Docker & Docker Compose**: Ensure Docker Desktop daemon is running.

---

### Step 1: Install Dependencies
```bash
npm install
```

---

### Step 2: Start the MOSIP Docker Services
```bash
cd mosip-stack
docker compose up -d
cd ..
```
*Spins up PostgreSQL (port 5433), Inji Certify (port 8090/8091), Mimoto (port 8099), Inji Verify (port 8095), and Inji Web (port 3004).*

---

### Step 3: Launch the Application
Run both the backend BFF proxy and the frontend Vite UI together:
```bash
npm run dev:all
```
Open your browser at **[http://localhost:3000](http://localhost:3000)**.

---

## 📱 Mobile Wallet Testing (Inji Mobile Android / iOS)
To test issuance or presentation with a physical smartphone running the Inji Mobile Wallet app:
1. Start an Ngrok tunnel to the BFF:
   ```bash
   ngrok http 3001
   ```
2. In your Android Inji Wallet app settings:
   * **Esignet Host:** `https://esignet-mosipid.collab.mosip.net`
   * **Credential Registry:** Your Ngrok public URL (e.g. `https://<subdomain>.ngrok-free.dev`)
3. Scan the generated QR codes directly in the app.

---

## 🧪 Headless Conformance Test Suite (CI)
Run the headless signature conformance test suite against live endpoints:
```bash
npm run check:suite
```
