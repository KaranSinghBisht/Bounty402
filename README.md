# Bounty402

Bounty402 is a minimal on-chain bounty + off-chain agent-verification demo built around **x402 payments** and **attested claims**.

Users can:
- chat with a small “assistant” that recommends a tool (tx vs wallet)
- run an agent (worker) to produce an analysis artifact
- submit that artifact to the on-chain Bounty402 contract
- verify the artifact via a paid x402 call to the validator worker
- claim the bounty using an attestation signature (`claimWithAttestation`)

Live demo: https://bounty402.vercel.app/

---

## What’s in this repo

### Apps
- **apps/web** — Next.js app (UI + API routes)
- **apps/worker** — Cloudflare Worker that verifies submissions and returns an attestation signature (paid via x402)

### Key flows
1. **Run agent** (`/api/agent/run`)
   - calls an external agent service (tx-explainer or wallet-explainer)
   - stores the returned JSON as a deterministic artifact
   - submits `artifactHash + uri` to the Bounty402 contract (`submitWork`)

2. **Verify + claim** (`/api/agent/verify-claim`)
   - does a discovery call to worker (expecting a `402` quote)
   - does a paid x402 call (buyer pays)
   - gets `attestation.signature`
   - simulates `claimWithAttestation(...)` and then sends the tx

3. **Chat assistant** (`/api/assistant/chat`)
   - Gemini-backed proxy recommending which tool to run:
     - tx hash → `tx-explainer`
     - address → `wallet-explainer`

---

## Prereqs

- Node.js 18+ (Node 20 recommended)
- pnpm (repo uses pnpm workspaces)
- A Base Sepolia RPC URL
- Testnet USDC + ETH on Base Sepolia for the configured wallets
- Cloudflare account (for worker deployment)
- Vercel account (for web deployment)

---

## Setup (local)

```bash
pnpm install
pnpm -C apps/web dev
# open http://localhost:3000
```

### Environment variables

Create `apps/web/.env.local`:
```env
# RPC / chain
RPC_URL=
NEXT_PUBLIC_RPC_URL=

# Contract addresses
NEXT_PUBLIC_BOUNTY402_ADDRESS=
NEXT_PUBLIC_USDC_ADDRESS=

# Accounts used by server routes (Node runtime)
SUBMITTER_PRIVATE_KEY=0x...
BUYER_PRIVATE_KEY=0x...

# x402 validator worker base URL
WORKER_URL=https://<your-worker>.workers.dev

# Agent endpoints (optional overrides)
TX_EXPLAINER_URL=https://tx-explainer.<domain>
WALLET_EXPLAINER_URL=https://wallet-agent.<domain>

# optional session versioning
AGENT_SESSION_VERSION=v2

# Gemini (assistant chat)
GOOGLE_GENERATIVE_AI_API_KEY=
GEMINI_MODEL_ID=gemini-2.0-flash
```

Notes:
- `SUBMITTER_PRIVATE_KEY` is the address that submits/claims on-chain from the server routes.
- `BUYER_PRIVATE_KEY` is used only to pay the x402 request to the worker.

apps/worker (Cloudflare Worker):
- Set these in Cloudflare dashboard (or `wrangler secret put ...` depending on your setup) for the validator logic, payee address, and network.
- Ensure worker supports `POST /api/validator/verify`, a 402 discovery quote, and paid verification returning `attestation.signature`.

---

## Run the demo (UI)
1. Open Chat Assistant (`/my-agent`)
2. Say: “I want to analyze a transaction”
3. Paste a tx hash (Base Sepolia)
4. Watch:
   - “Initialize bounty escrow”
   - “Provide input & execute”
   - “Verification & settlement” (x402 + `claimWithAttestation`)

Repeat with a wallet address to run the wallet flow.

---

## Deterministic “nice summaries” (UI)

Agent artifacts are JSON for verifiability. The UI additionally renders a deterministic summary (paragraph + highlights + flags) derived from the JSON so the demo doesn’t look like a raw API response.

---

## Deploy

### Deploy worker (Cloudflare)
From `apps/worker`:
```bash
pnpm -C apps/worker deploy
```
Then set `WORKER_URL` in the web env to your worker URL.

### Vercel (web)
- Root directory: `apps/web`
- Install command: `pnpm install --frozen-lockfile`
- Build command: `pnpm --filter web build`

---

## License

MIT (or your preferred license)
