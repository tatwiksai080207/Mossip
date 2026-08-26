# Inji Interoperability Playground

A web app for testing Verifiable Credential flows across the MOSIP Inji ecosystem.

Lets you pick any combination of Issuer, Wallet, and Verifier, then run the full **Issue → Hold → Present → Verify** lifecycle while inspecting protocol payloads.

## Tech Stack

- React + TypeScript (Vite)
- Tailwind CSS

## Getting Started

```bash
npm install
npm run dev
```

Opens at http://localhost:3000

## Project Context

Built for testing interoperability across:
- **Inji Certify** — credential issuance (OpenID4VCI)
- **Inji Web / Inji Wallet** — credential storage
- **Inji Verify** — credential verification (OpenID4VP)
