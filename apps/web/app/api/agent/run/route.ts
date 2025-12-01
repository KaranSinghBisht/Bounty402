// /web/app/api/agent/run/route.ts
import crypto from "node:crypto";
import { z } from "zod";
import { createPublicClient, createWalletClient, decodeEventLog, http, keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bountyAbi } from "@/lib/abi";
import { baseSepolia } from "@/lib/chain";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/apiError";
import { putArtifact } from "@/app/api/artifacts/store";

const submissionCreatedAbi = [
  {
    type: "event",
    name: "SubmissionCreated",
    inputs: [
      { name: "bountyId", type: "uint256", indexed: true },
      { name: "submissionId", type: "uint256", indexed: true },
      { name: "submitter", type: "address", indexed: true },
      { name: "artifactHash", type: "bytes32", indexed: false },
      { name: "uri", type: "string", indexed: false },
    ],
    anonymous: false,
  },
] as const;

const BodySchema = z
  .object({
    bountyId: z.coerce.number().int().nonnegative(),
    input: z.string().min(1),
    agentType: z.enum(["tx-explainer", "wallet-explainer"]).default("tx-explainer"),
  })
  .superRefine((val, ctx) => {
    if (val.agentType === "tx-explainer") {
      if (!/^0x[a-fA-F0-9]{64}$/.test(val.input)) {
        ctx.addIssue({ code: "custom", message: "tx-explainer expects a 0x + 64-hex tx hash", path: ["input"] });
      }
    } else {
      if (!/^0x[a-fA-F0-9]{40}$/.test(val.input)) {
        ctx.addIssue({ code: "custom", message: "wallet-explainer expects a 0x + 40-hex address", path: ["input"] });
      }
    }
  });

function stableStringify(value: any): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys.map((k) => JSON.stringify(k) + ":" + stableStringify(value[k])).join(",")}}`;
}

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const rpcUrl = process.env.RPC_URL || env.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL;
  const bountyAddress = (process.env.NEXT_PUBLIC_BOUNTY402_ADDRESS || env.bounty402Address) as Hex | undefined;
  const submitterPk = process.env.SUBMITTER_PRIVATE_KEY as Hex | undefined;

  if (!rpcUrl || !bountyAddress || !submitterPk) {
    return jsonError(
      "MISSING_ENV",
      "Missing RPC_URL/NEXT_PUBLIC_RPC_URL/NEXT_PUBLIC_BOUNTY402_ADDRESS/SUBMITTER_PRIVATE_KEY",
      500,
      undefined,
      requestId,
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("INVALID_BODY", "Invalid request body", 400, parsed.error.flatten(), requestId);
  }

  const agentType = parsed.data.agentType;
  const txAgentUrl = process.env.TX_EXPLAINER_URL || "https://tx-explainer.karanbishttt.workers.dev";
  const walletAgentUrl =
    process.env.WALLET_AGENT_URL || process.env.WALLET_EXPLAINER_URL || "https://wallet-agent.karanbishttt.workers.dev";

  const agentUrl = agentType === "wallet-explainer" ? walletAgentUrl : txAgentUrl;

  const sessionVersion = process.env.AGENT_SESSION_VERSION || "v1";
  const sessionId = `${sessionVersion}-bounty-${parsed.data.bountyId}-${agentType}`;

  const prompt =
    agentType === "tx-explainer"
      ? `ONLY THE JSON. Call getTxSummary with {"hash":"${parsed.data.input}"}`
      : `ONLY THE JSON. Analyze this wallet address: ${parsed.data.input}. Return a compact JSON risk/profile summary.`;

  const agentRes = await fetch(`${agentUrl}/agent/chat/${sessionId}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!agentRes.ok) {
    const text = await agentRes.text().catch(() => "");
    return jsonError("AGENT_FAILED", `${agentType} failed`, 502, { status: agentRes.status, body: text, agentUrl }, requestId);
  }

  const raw = await agentRes.text().catch(() => "");

  let txSummary: any;
  try {
    txSummary = JSON.parse(raw);
  } catch {
    // Attempt to strip Markdown fences/backticks if present
    const cleaned = raw.replace(/```[a-zA-Z0-9]*\s*([\s\S]*?)```/m, "$1").trim();
    try {
      txSummary = JSON.parse(cleaned);
    } catch {
      return jsonError(
        "AGENT_BAD_JSON",
        `${agentType} returned non-JSON`,
        502,
        { agentUrl, sample: raw.slice(0, 800) },
        requestId,
      );
    }
  }

  const account = privateKeyToAccount(submitterPk);
  const walletClient = createWalletClient({
    account,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const bountyState = (await publicClient.readContract({
    address: bountyAddress,
    abi: bountyAbi,
    functionName: "bounties",
    args: [BigInt(parsed.data.bountyId)],
  })) as any;

  const creator = (bountyState?.[0] as string) ?? "0x0000000000000000000000000000000000000000";
  const deadline = Number(bountyState?.[1] ?? 0);
  const status = Number(bountyState?.[2] ?? 999);

  if (creator.toLowerCase() === "0x0000000000000000000000000000000000000000") {
    return jsonError("BOUNTY_NOT_FOUND", "Bounty does not exist", 400, { bountyId: parsed.data.bountyId }, requestId);
  }
  if (status !== 0) {
    return jsonError(
      "BOUNTY_NOT_OPEN",
      "Bounty is not open (already awarded/cancelled/paid)",
      400,
      { bountyId: parsed.data.bountyId, status },
      requestId,
    );
  }
  if (deadline && Math.floor(Date.now() / 1000) > deadline) {
    return jsonError(
      "BOUNTY_EXPIRED",
      "Bounty deadline has passed",
      400,
      { bountyId: parsed.data.bountyId, deadline },
      requestId,
    );
  }

  const artifactObj = {
    kind: agentType === "tx-explainer" ? "txSummary" : "walletSummary",
    agentType,
    bountyId: parsed.data.bountyId,
    input: parsed.data.input,
    result: txSummary,
    createdAt: new Date().toISOString(),
  };

  const artifactJson = stableStringify(artifactObj);
  const artifactHash = keccak256(toBytes(artifactJson));
  putArtifact(artifactHash, artifactJson);

  const xfProto = req.headers.get("x-forwarded-proto");
  const xfHost = req.headers.get("x-forwarded-host");
  const host = req.headers.get("host");

  const origin =
    xfProto && xfHost
      ? `${xfProto}://${xfHost}`
      : host
        ? `https://${host}`
        : req.headers.get("origin") || "http://localhost:3000";

  const uri = `${origin}/api/artifacts/${artifactHash}`;

  try {
    await publicClient.simulateContract({
      address: bountyAddress,
      abi: bountyAbi,
      functionName: "submitWork",
      args: [BigInt(parsed.data.bountyId), artifactHash, uri],
      account,
    });

    const txHash = await walletClient.writeContract({
      address: bountyAddress,
      abi: bountyAbi,
      functionName: "submitWork",
      args: [BigInt(parsed.data.bountyId), artifactHash, uri],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    let submissionId: bigint | null = null;

    for (const log of receipt.logs) {
      if (!log.topics?.length) continue;
      if (log.address?.toLowerCase() !== bountyAddress.toLowerCase()) continue;

      try {
        const decoded = decodeEventLog({
          abi: submissionCreatedAbi,
          data: log.data,
          topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
        });

        // If decodeEventLog succeeds with this ABI, it's the right event.
        submissionId = (decoded.args as { submissionId: bigint }).submissionId;
        break;
      } catch {
        // not SubmissionCreated
      }
    }

    if (!submissionId || submissionId === 0n) {
      submissionId = (await publicClient.readContract({
        address: bountyAddress,
        abi: bountyAbi,
        functionName: "submissionCount",
        args: [BigInt(parsed.data.bountyId)],
      })) as bigint;
    }

    return Response.json({
      requestId,
      submissionId: Number(submissionId || 0n),
      artifactHash,
      submitTxHash: txHash,
      txSummary,
      sessionId,
    });
  } catch (err) {
    console.error("agent/run error", err);
    return jsonError("SUBMIT_WORK_FAILED", (err as Error)?.message || "submitWork failed", 500, undefined, requestId);
  }
}
