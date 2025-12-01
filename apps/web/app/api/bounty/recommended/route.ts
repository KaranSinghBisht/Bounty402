// /web/app/api/bounty/recommended/route.ts
import crypto from "node:crypto";
import { createPublicClient, http, type Hex } from "viem";
import { baseSepolia } from "@/lib/chain";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/apiError";
import { bountyAbi } from "@/lib/abi";

export const runtime = "nodejs";

export async function GET() {
  const requestId = crypto.randomUUID();
  const rpcUrl = process.env.RPC_URL || env.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL;
  const bountyAddress = (process.env.NEXT_PUBLIC_BOUNTY402_ADDRESS || env.bounty402Address) as Hex | undefined;

  if (!rpcUrl || !bountyAddress) {
    return jsonError(
      "MISSING_ENV",
      "Missing RPC_URL/NEXT_PUBLIC_RPC_URL and NEXT_PUBLIC_BOUNTY402_ADDRESS",
      500,
      undefined,
      requestId,
    );
  }

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });

  try {
    const bountyCount = (await publicClient.readContract({
      address: bountyAddress,
      abi: bountyAbi,
      functionName: "bountyCount",
    })) as bigint;
    const now = Math.floor(Date.now() / 1000);

    for (let i = Number(bountyCount); i >= 1; i--) {
      const b = (await publicClient.readContract({
        address: bountyAddress,
        abi: bountyAbi,
        functionName: "bounties",
        args: [BigInt(i)],
      })) as any;

      const creator = (b?.[0] as string) ?? "0x0000000000000000000000000000000000000000";
      const deadline = Number(b?.[1] ?? 0);
      const status = Number(b?.[2] ?? 999);

      const exists = creator.toLowerCase() !== "0x0000000000000000000000000000000000000000";
      const open = status === 0;
      const notExpired = !deadline || now <= deadline;

      if (exists && open && notExpired) {
        return Response.json({ requestId, bountyId: i, bountyCount: Number(bountyCount), status, deadline });
      }
    }

    return Response.json({
      requestId,
      bountyId: null,
      bountyCount: Number(bountyCount),
      reason: "No open bounty found",
    });
  } catch (e: any) {
    return jsonError("BOUNTY_LOOKUP_FAILED", e?.message ?? "bounty lookup failed", 500, undefined, requestId);
  }
}
