// /web/lib/clients.ts
import { createPublicClient, http } from "viem";
import { baseSepolia } from "./chain";

export function getPublicClient() {
  const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";
  return createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
}
