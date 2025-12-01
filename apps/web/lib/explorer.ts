// /web/lib/explorer.ts
import { baseSepolia } from "@/lib/chain";

const EXPLORER = baseSepolia.blockExplorers?.default.url ?? "https://sepolia.basescan.org";

export const txUrl = (hash?: string | null) => (hash ? `${EXPLORER}/tx/${hash}` : null);
export const addressUrl = (addr?: string | null) => (addr ? `${EXPLORER}/address/${addr}` : null);
