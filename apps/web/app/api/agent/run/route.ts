import { z } from "zod";
import { createPublicClient, createWalletClient, decodeEventLog, http, keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bountyAbi } from "@/lib/abi";
import { baseSepolia } from "@/lib/chain";
import { env } from "@/lib/env";

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
  bountyId: z.number().int().positive(),
  prompt: z.string().min(1),
  agentType: z.string().min(1),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rpcUrl = process.env.RPC_URL || env.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL;
  const bountyAddress = (process.env.NEXT_PUBLIC_BOUNTY402_ADDRESS || env.bounty402Address) as Hex | undefined;
  const submitterPk = process.env.SUBMITTER_PRIVATE_KEY as Hex | undefined;

  if (!rpcUrl || !bountyAddress || !submitterPk) {
    return Response.json(
      { error: "Missing RPC_URL/NEXT_PUBLIC_RPC_URL/NEXT_PUBLIC_BOUNTY402_ADDRESS/SUBMITTER_PRIVATE_KEY" },
      { status: 500 },
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
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

  const artifact = `agent:${parsed.data.agentType}|prompt:${parsed.data.prompt}|bounty:${parsed.data.bountyId}`;
  const artifactHash = keccak256(toBytes(artifact));
  const uri = `data:application/json,${encodeURIComponent(
    JSON.stringify({ prompt: parsed.data.prompt, agentType: parsed.data.agentType, artifact }),
  )}`;

  try {
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
      submissionId: Number(submissionId || 0n),
      artifact,
      artifactHash,
      txHash,
    });
  } catch (err) {
    console.error("agent/run error", err);
    return Response.json({ error: (err as Error)?.message || "submitWork failed" }, { status: 500 });
  }
}
