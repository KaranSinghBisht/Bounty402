import { Hono } from "hono";
import { cors } from "hono/cors";
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
const JOB_PAYMENT_AMOUNT = 10_000n; // 0.01 USDC (6 decimals)

type Env = {
  RESOURCE_WALLET_ADDRESS: string;
  NETWORK?: string;
  VALIDATOR_PRIVATE_KEY: string;
  BOUNTY402_ADDRESS: string;
  BOUNTY402_CHAIN_ID?: string;
  AGENT_REGISTRY_ADDRESS: string;
  USDC_ADDRESS: string;
  RPC_URL?: string;
};

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
});

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

const VerifyBody = z.object({
  bountyId: z.coerce.number().int().nonnegative(),
  submissionId: z.coerce.number().int().positive(),
  claimant: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  artifactHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  client: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  declaredClient: z.string().regex(/^0x[a-fA-F0-9]{40}$/).nullable().optional(),
});

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "X-Payment"], exposeHeaders: ["X-Session-Id"] }));

app.onError((err, c) => {
  console.error("validator worker error:", (err as any)?.stack || err);
  return c.text("Internal server error", 500);
});

app.get("/", (c) => {
  const env = EnvSchema.parse({
    ...c.env,
    NETWORK: c.env.NETWORK ?? "base-sepolia",
    BOUNTY402_CHAIN_ID: c.env.BOUNTY402_CHAIN_ID ?? "84532",
    RPC_URL: c.env.RPC_URL ?? "https://sepolia.base.org",
  });
  return c.json({ ok: true, service: "Bounty402 Validator", x402: { network: env.NETWORK } });
});

app.use((c, next) => {
  const env = EnvSchema.parse({
    ...c.env,
    NETWORK: c.env.NETWORK ?? "base-sepolia",
    BOUNTY402_CHAIN_ID: c.env.BOUNTY402_CHAIN_ID ?? "84532",
    RPC_URL: c.env.RPC_URL ?? "https://sepolia.base.org",
  });

  const payTo = env.RESOURCE_WALLET_ADDRESS as Address;

  return paymentMiddleware(
    payTo,
    {
      "/api/validator/verify": {
        price: "$0.01",
        network: env.NETWORK,
        config: { description: "Verify bounty submission + issue attestation" },
      },
    },
    facilitator,
  )(c as any, next);
});

app.post("/api/validator/verify", async (c) => {
  const env = EnvSchema.parse({
    ...c.env,
    NETWORK: c.env.NETWORK ?? "base-sepolia",
    BOUNTY402_CHAIN_ID: c.env.BOUNTY402_CHAIN_ID ?? "84532",
    RPC_URL: c.env.RPC_URL ?? "https://sepolia.base.org",
  });

  const parsed = VerifyBody.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ ok: false, error: parsed.error.flatten() }, 400);

  const xPayment = c.req.header("x-payment");
  if (!xPayment) return c.json({ ok: false, error: "missing x-payment" }, 400);

  const validator = privateKeyToAccount(env.VALIDATOR_PRIVATE_KEY as Hex);

  const chainId = BigInt(env.BOUNTY402_CHAIN_ID);
  const bountyAddress = env.BOUNTY402_ADDRESS as Address;
  const registryAddress = env.AGENT_REGISTRY_ADDRESS as Address;
  const paymentToken = env.USDC_ADDRESS as Address;

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

  const chain = baseSepolia.id === Number(chainId) ? baseSepolia : { ...baseSepolia, id: Number(chainId) };
  const transport = http(env.RPC_URL);
  const walletClient = createWalletClient({ account: validator, chain, transport });
  const publicClient = createPublicClient({ chain, transport });

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

export default {
  fetch: app.fetch,
};
