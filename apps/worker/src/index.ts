import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { paymentMiddleware } from "x402-hono";
import {
  encodeAbiParameters,
  keccak256,
  stringToBytes,
  toBytes,
  type Hex,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

const facilitator = { url: "https://x402.org/facilitator" as const };
const VERIFICATION_TAG = keccak256(toBytes("Bounty402Verification"));

const NetworkSchema = z.enum([
  "base-sepolia",
  "base",
  "abstract",
  "abstract-testnet",
  "avalanche-fuji",
  "avalanche",
  "iotex",
  "solana-devnet",
  "solana",
  "sei",
  "sei-testnet",
  "polygon",
  "polygon-amoy",
  "peaq",
  "story",
  "educhain",
  "skale-base-sepolia",
]);

const EnvSchema = z.object({
  RESOURCE_WALLET_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  NETWORK: NetworkSchema.default("base-sepolia"),
  VALIDATOR_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  BOUNTY402_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  BOUNTY402_CHAIN_ID: z.coerce.number().int().positive().default(84532),
  PORT: z.coerce.number().default(8787),
});

const ENV = EnvSchema.parse(process.env);

const payTo = ENV.RESOURCE_WALLET_ADDRESS as Address;
const network = ENV.NETWORK;
const validator = privateKeyToAccount(ENV.VALIDATOR_PRIVATE_KEY as Hex);
const bountyAddress = ENV.BOUNTY402_ADDRESS as Address;
const chainId = BigInt(ENV.BOUNTY402_CHAIN_ID);

const app = new Hono();

app.get("/", (c) =>
  c.json({ ok: true, service: "Bounty402 Worker", x402: { network } }),
);

app.use(
  paymentMiddleware(
    payTo,
    {
      "/api/validator/verify": {
        price: "$0.01",
        network,
        config: { description: "Verify bounty submission + issue attestation" },
      },
    },
    facilitator,
  ),
);

const VerifyBody = z.object({
  bountyId: z.coerce.number().int().positive(),
  submissionId: z.coerce.number().int().positive(),
  claimant: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  artifactHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

app.post("/api/validator/verify", async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = VerifyBody.safeParse(json);
  if (!parsed.success) return c.json({ ok: false, error: parsed.error.flatten() }, 400);

  const xPayment = c.req.header("x-payment");
  if (!xPayment) return c.json({ ok: false, error: "missing x-payment" }, 400);
  const jobId = keccak256(stringToBytes(xPayment));

  const digest = keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        { type: "uint256" },
        { type: "uint256" },
        { type: "address" },
        { type: "bytes32" },
      ],
      [
        VERIFICATION_TAG,
        chainId,
        bountyAddress,
        BigInt(parsed.data.bountyId),
        BigInt(parsed.data.submissionId),
        parsed.data.claimant as Address,
        parsed.data.artifactHash as Hex,
      ],
    ),
  );

  const signature = await validator.signMessage({ message: { raw: digest } });

  return c.json({
    ok: true,
    jobId,
    digest,
    attestation: { validator: validator.address, signature, digest },
    received: parsed.data,
    timestamp: new Date().toISOString(),
  });
});

serve({ fetch: app.fetch, port: ENV.PORT });
console.log(`Worker listening on http://localhost:${ENV.PORT}`);
