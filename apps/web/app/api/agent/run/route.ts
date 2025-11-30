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

const BodySchema = z.object({
  bountyId: z.coerce.number().int().nonnegative(),
  txHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  agentType: z.string().min(1).default("tx-explainer"),
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

  const txExplainerUrl = process.env.TX_EXPLAINER_URL || "https://tx-explainer.karanbishttt.workers.dev";
  const sessionId = `bounty-${parsed.data.bountyId}`;

  const agentRes = await fetch(`${txExplainerUrl}/agent/chat/${sessionId}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: `ONLY THE JSON. Call getTxSummary with {"hash":"${parsed.data.txHash}"}`,
        },
      ],
    }),
  });

  if (!agentRes.ok) {
    const text = await agentRes.text().catch(() => "");
    return jsonError(
      "TX_EXPLAINER_FAILED",
      "tx-explainer failed",
      502,
      { status: agentRes.status, body: text },
      requestId,
    );
  }

  const txSummary = await agentRes.json();

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

  const artifactObj = {
    kind: "txSummary",
    agentType: parsed.data.agentType,
    bountyId: parsed.data.bountyId,
    txHash: parsed.data.txHash,
    result: txSummary,
    createdAt: new Date().toISOString(),
  };

  const artifactJson = stableStringify(artifactObj);
  const artifactHash = keccak256(toBytes(artifactJson));
  putArtifact(artifactHash, artifactJson);
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const uri = `${baseUrl}/api/artifacts/${artifactHash}`;

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
