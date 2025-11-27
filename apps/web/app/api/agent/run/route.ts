import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient, createWalletClient, http, keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { bountyAbi } from "@/lib/abi";
import { baseSepolia } from "@/lib/chain";

const BodySchema = z.object({
  bountyId: z.number().int().positive(),
  prompt: z.string().min(1),
  agentType: z.string().min(1),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL;
  const bountyAddress = process.env.NEXT_PUBLIC_BOUNTY402_ADDRESS as Hex | undefined;
  const submitterPk = process.env.SUBMITTER_PRIVATE_KEY as Hex | undefined;

  if (!rpcUrl || !bountyAddress || !submitterPk) {
    return NextResponse.json({ error: "Missing RPC_URL/NEXT_PUBLIC_BOUNTY402_ADDRESS/SUBMITTER_PRIVATE_KEY" }, { status: 500 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
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

    await publicClient.waitForTransactionReceipt({ hash: txHash });

    const submissionId = await publicClient.readContract({
      address: bountyAddress,
      abi: bountyAbi,
      functionName: "submissionCount",
      args: [BigInt(parsed.data.bountyId)],
    });

    return NextResponse.json({
      submissionId: Number(submissionId),
      artifact,
      artifactHash,
      txHash,
    });
  } catch (err) {
    console.error("agent/run error", err);
    return NextResponse.json({ error: "submitWork failed" }, { status: 500 });
  }
}
