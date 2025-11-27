# Bounty402 Web Demo

Minimal Next.js UI to create a bounty, run the server-side agent, and verify + claim via x402.

## Prereqs
- Node 18+
- `pnpm install` at repo root
- Contracts deployed and worker running

## Setup
1) Copy env: `cp apps/web/.env.example apps/web/.env.local` and fill values (RPC, contract addresses, submitter/buyer keys, worker URL).
2) Install deps (from repo root): `pnpm install`
3) Run worker: `(cd apps/worker && pnpm dev)`
4) Run web: `(cd apps/web && pnpm dev)`

## What the UI does
- Browser: connect wallet, approve USDC, `createBountyWithValidator`.
- Server routes:
  - `POST /api/agent/run`: uses `SUBMITTER_PRIVATE_KEY` to submit work.
  - `POST /api/agent/verify-claim`: pays worker with `BUYER_PRIVATE_KEY`, gets attestation, then claims with submitter key.
- Balance panel shows USDC balances for contract, creator (connected wallet), and submitter.
