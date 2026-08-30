# Inji Interoperability Playground

A unified web application for testing **Verifiable Credential interoperability** across the [MOSIP Inji](https://docs.inji.io/) ecosystem. Issue, hold, present, and verify credentials across Inji Certify, Inji Web, and Inji Verify — visualizing every protocol exchange along the way.

## Features

- **3-Column Role Selector** — Pick an Issuer, Wallet, and Verifier from a matrix of implementations
- **Live Sandbox Integration** — Connects to the MOSIP Collab sandbox via a BFF proxy for real API calls
- **Protocol Inspector** — Click any step to inspect the raw JSON payloads (credential offers, tokens, VPs)
- **Sequence Diagram** — Animated Issuer ↔ Wallet ↔ Verifier message flow
- **Test Reports** — Pass/fail interoperability report per test run
- **Run History** — Track and compare multiple test runs
- **Multi-Format Support** — W3C VC (JSON-LD) and SD-JWT VC credential formats

## Architecture

```
┌──────────────────────────────────────────────────────┐
│                  Browser (React)                      │
│  ┌──────────┐  ┌────────────┐  ┌──────────────────┐  │
│  │ Role     │  │ Flow       │  │ Sequence         │  │
│  │ Selector │  │ Progress   │  │ Diagram          │  │
│  └──────────┘  └────────────┘  └──────────────────┘  │
│  ┌──────────┐  ┌────────────┐                        │
│  │ Test     │  │ Run        │                        │
│  │ Report   │  │ History    │                        │
│  └──────────┘  └────────────┘                        │
└──────────────────┬───────────────────────────────────┘
                   │ /api/*
                   ▼
┌──────────────────────────────────────────────────────┐
│           BFF Proxy (Express, port 3001)              │
│                                                       │
│  /api/issuer/*   → injicertify-mock.collab.mosip.net │
│  /api/esignet/*  → esignet-mock.collab.mosip.net     │
│  /api/verifier/* → api.collab.mosip.net              │
│  /api/flow/issue → Orchestrated OpenID4VCI flow      │
└──────────────────────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────┐
│           MOSIP Collab Sandbox                        │
│                                                       │
│  Inji Certify (Mock)  │  eSignet (Mock)  │  Inji    │
│  OpenID4VCI Issuer     │  OAuth/OIDC      │  Verify  │
└──────────────────────────────────────────────────────┘
```

### Protocol Flow

The playground executes the full **OpenID4VCI + OpenID4VP** lifecycle:

```
OpenID4VCI (Issuance)                    OpenID4VP (Verification)
─────────────────────                    ────────────────────────
1. Issuer Metadata Discovery             5. VP Authorization Request
2. Credential Offer                      6. VP Token Response
3. Token Exchange (Nonce + JWT Proof)    7. Verification Result
4. Credential Issuance
```

## Quick Start

### Prerequisites

- Node.js v18+ (tested with v24)
- npm v9+

### Setup

```bash
# Clone the repo
git clone <repo-url>
cd inji-playground

# Install dependencies
npm install
```

### Running

You need **two terminals** (or use `npm run dev:all`):

```bash
# Terminal 1: Start the BFF proxy server
npm run server

# Terminal 2: Start the frontend dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Running Both Together

```bash
npm run dev:all
```

## Usage

1. **Select Roles** — Choose an Issuer, Wallet, and Verifier from the selector cards
2. **Pick a Credential Format** — W3C VC (JSON-LD) or SD-JWT VC
3. **Click "Run Test"** — The flow executes step by step
4. **Inspect Payloads** — Click any completed step to see the raw JSON
5. **View the Report** — Scroll down for the pass/fail summary
6. **Check the Sequence Diagram** — See the protocol message flow visualized

Each step shows a **`live`** or **`mock`** badge:
- **live** — Data came from the real Collab sandbox
- **mock** — Simulated locally (fallback or wallet-initiated step)

## Project Structure

```
inji-playground/
├── server/
│   └── index.ts              # Express BFF proxy + orchestrated flows
├── src/
│   ├── App.tsx                # Main layout
│   ├── api.ts                 # Frontend API service (calls BFF)
│   ├── config.ts              # Issuer/wallet/verifier registry
│   ├── store.ts               # Zustand state management
│   ├── types.ts               # TypeScript domain types
│   └── components/
│       ├── FlowProgress.tsx   # Step list with payload inspector
│       ├── Header.tsx         # App header
│       ├── RoleSelector.tsx   # 3-column role picker
│       ├── RunHistory.tsx     # Past test runs
│       ├── SequenceDiagram.tsx# Protocol message flow
│       └── TestReport.tsx     # Pass/fail report
├── index.html
├── package.json
├── vite.config.ts             # Vite + proxy config
└── tsconfig.json
```

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Frontend | React 18 + TypeScript |
| Build Tool | Vite 8 |
| Styling | Tailwind CSS 4 |
| State Management | Zustand |
| BFF Server | Express 5 |
| Crypto | jose (JWT signing, key generation) |
| Sandbox | MOSIP Collab Environment |

## Sandbox Endpoints

| Service | URL |
|---------|-----|
| Inji Certify (Mock) | `https://injicertify-mock.collab.mosip.net` |
| eSignet (Mock) | `https://esignet-mock.collab.mosip.net` |
| Inji Verify | `https://api.collab.mosip.net` |

## Supported Combinations

| Issuer | Wallet | Verifier | Format | Status |
|--------|--------|----------|--------|--------|
| Inji Certify (Mock Identity) | Inji Web | Inji Verify | W3C VC (JSON-LD) | Live sandbox calls |
| Inji Certify (Mock Identity) | Inji Web | Inji Verify | SD-JWT VC | Live sandbox calls |
| Inji Certify (Mock Identity) | Inji Wallet (Mobile) | Inji Verify | W3C VC (JSON-LD) | Live sandbox calls |

## Interoperability Findings

### What Works
- Issuer metadata discovery returns complete OpenID4VCI configuration
- Nonce endpoint provides fresh `c_nonce` values for proof generation
- JWT proof-of-possession (EdDSA) is generated and accepted structurally
- Credential endpoint validates the proof format before checking authorization

### Discovered Gaps
- The mock issuer requires full OAuth flow through eSignet — no pre-authorized code flow is available
- eSignet-mock requires dynamic OTP (not static) making automated testing complex
- The credential endpoint returns 403 without a valid access token, even with a correct JWT proof

## License

MIT
