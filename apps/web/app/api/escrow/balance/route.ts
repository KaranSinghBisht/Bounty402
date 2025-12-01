// /web/app/api/escrow/balance/route.ts
import crypto from "node:crypto";
import { createPublicClient, formatUnits, http, type Hex } from "viem";
import { baseSepolia } from "@/lib/chain";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/apiError";

export const runtime = "nodejs";

const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export async function GET() {
  const requestId = crypto.randomUUID();
  const rpcUrl = process.env.RPC_URL || env.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL;
  const bountyAddress = (process.env.NEXT_PUBLIC_BOUNTY402_ADDRESS || env.bounty402Address) as Hex | undefined;

  const tokenAddress = (process.env.NEXT_PUBLIC_USDC_ADDRESS ||
    process.env.USDC_ADDRESS ||
    process.env.USDC_BASE_SEPOLIA) as Hex | undefined;

  if (!rpcUrl || !bountyAddress || !tokenAddress) {
    return jsonError(
      "MISSING_ENV",
      "Missing RPC_URL/NEXT_PUBLIC_RPC_URL/NEXT_PUBLIC_BOUNTY402_ADDRESS and NEXT_PUBLIC_USDC_ADDRESS (or USDC_ADDRESS/USDC_BASE_SEPOLIA)",
      500,
      undefined,
      requestId,
    );
  }

  const publicClient = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) });

  try {
    const [bal, decimals, symbol] = await Promise.all([
      publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "balanceOf", args: [bountyAddress] }),
      publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "decimals" }),
      publicClient.readContract({ address: tokenAddress, abi: erc20Abi, functionName: "symbol" }),
    ]);

    return Response.json({
      requestId,
      token: tokenAddress,
      symbol,
      decimals,
      raw: bal.toString(),
      formatted: formatUnits(bal, decimals),
    });
  } catch (e: any) {
    return jsonError("ESCROW_READ_FAILED", e?.message ?? "escrow read failed", 500, undefined, requestId);
  }
}
