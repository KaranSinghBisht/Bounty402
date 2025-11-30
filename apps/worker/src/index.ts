// /worker/src/index.ts
import "dotenv/config";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import { paymentMiddleware } from "x402-hono";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  http,
  keccak256,
  stringToBytes,
  toBytes,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

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
  AGENT_REGISTRY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  USDC_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  RPC_URL: z.string().url().default("https://sepolia.base.org"),
  PORT: z.coerce.number().default(8787),
});

const ENV = EnvSchema.parse({
  ...process.env,
  AGENT_REGISTRY_ADDRESS:
    process.env.AGENT_REGISTRY_ADDRESS || process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS || process.env.AGENT_REGISTRY,
  USDC_ADDRESS: process.env.USDC_ADDRESS || process.env.NEXT_PUBLIC_USDC_ADDRESS,
});

const payTo = ENV.RESOURCE_WALLET_ADDRESS as Address;
const network = ENV.NETWORK;
const validator = privateKeyToAccount(ENV.VALIDATOR_PRIVATE_KEY as Hex);
const bountyAddress = ENV.BOUNTY402_ADDRESS as Address;
const chainId = BigInt(ENV.BOUNTY402_CHAIN_ID);
const registryAddress = ENV.AGENT_REGISTRY_ADDRESS as Address;
const paymentToken = ENV.USDC_ADDRESS as Address;
const rpcUrl = ENV.RPC_URL;
const JOB_PAYMENT_AMOUNT = 10_000n; // 0.01 USDC (6 decimals)

const agentRegistryAbi = [
  {
    type: "function",
    name: "registerJob",
    stateMutability: "nonpayable",
    inputs: [
      { name: "jobId", type: "bytes32" },
      { name: "agent", type: "address" },
      { name: "client", type: "address" },
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
] as const;

const chain = baseSepolia.id === Number(chainId) ? baseSepolia : { ...baseSepolia, id: Number(chainId) };
const transport = http(rpcUrl);
const walletClient = createWalletClient({ account: validator, chain, transport });
const publicClient = createPublicClient({ chain, transport });

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
  bountyId: z.coerce.number().int().nonnegative(),
  submissionId: z.coerce.number().int().positive(),
  claimant: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  artifactHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  client: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  declaredClient: z.string().regex(/^0x[a-fA-F0-9]{40}$/).nullable().optional(),
});

app.post("/api/validator/verify", async (c) => {
  const json = await c.req.json().catch(() => null);
  const parsed = VerifyBody.safeParse(json);
  if (!parsed.success) return c.json({ ok: false, error: parsed.error.flatten() }, 400);

  const xPayment = c.req.header("x-payment");
  if (!xPayment) return c.json({ ok: false, error: "missing x-payment" }, 400);
  const jobId = keccak256(stringToBytes(xPayment));
  const jobClient = (parsed.data.declaredClient || parsed.data.client) as Address;
  const agent = parsed.data.claimant as Address;

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

  let jobTxHash: Hex | null = null;
  let jobError: string | null = null;

  try {
    const txHash = await walletClient.writeContract({
      address: registryAddress,
      abi: agentRegistryAbi,
      functionName: "registerJob",
      args: [jobId, agent, jobClient, paymentToken, JOB_PAYMENT_AMOUNT],
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    jobTxHash = txHash;
  } catch (err) {
    console.error("registerJob failed", err);
    jobError = (err as Error)?.message ?? String(err);
  }

  return c.json({
    ok: true,
    jobRegistered: Boolean(jobTxHash),
    jobId,
    jobTxHash,
    jobError,
    digest,
    attestation: { validator: validator.address, signature, digest },
    received: parsed.data,
    timestamp: new Date().toISOString(),
  });
});

serve({ fetch: app.fetch, port: ENV.PORT });
console.log(`Worker listening on http://localhost:${ENV.PORT}`);
