export type AgentSummary = {
  headline: string;
  paragraph: string;
  chips: { label: string; value: string }[];
  highlights: string[];
  flags: string[];
};

type AnyObj = Record<string, any>;

function isObj(v: unknown): v is AnyObj {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function lower(s: unknown) {
  return typeof s === "string" ? s.toLowerCase() : "";
}

function trunc(addr: string, n = 6) {
  if (!addr || addr.length < 12) return addr;
  return `${addr.slice(0, 2 + n)}…${addr.slice(-4)}`;
}

function safeNum(v: any): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function safeBigInt(v: any): bigint | null {
  try {
    if (typeof v === "bigint") return v;
    if (typeof v === "number" && Number.isFinite(v)) return BigInt(Math.floor(v));
    if (typeof v === "string" && v.length) return BigInt(v);
    return null;
  } catch {
    return null;
  }
}

function formatTokenAmount(raw: string, decimals: number): string {
  const bi = safeBigInt(raw);
  if (bi === null) return raw;

  const base = 10n ** BigInt(decimals);
  const whole = bi / base;
  const frac = bi % base;

  if (decimals === 0) return whole.toString();

  let fracStr = frac.toString().padStart(decimals, "0");
  fracStr = fracStr.replace(/0+$/, "");
  return fracStr.length ? `${whole.toString()}.${fracStr}` : whole.toString();
}

function last<T>(arr: T[]): T | null {
  return arr.length ? arr[arr.length - 1] : null;
}

export function summarizeTx(raw: unknown, opts?: { usdcAddress?: string; usdcDecimals?: number }): AgentSummary {
  const obj = isObj(raw) ? raw : {};
  const hash = String(obj.hash ?? "");
  const from = String(obj.from ?? "");
  const to = String(obj.to ?? "");
  const status = String(obj.status ?? "unknown");
  const valueEth = String(obj.valueEth ?? "0");
  const kind = String(obj.decodedInput?.kind ?? "unknown");

  const transfers: AnyObj[] = Array.isArray(obj.transfers) ? obj.transfers : [];
  const transferCount = transfers.length;

  const usdc = lower(opts?.usdcAddress ?? process.env.NEXT_PUBLIC_USDC_ADDRESS ?? "0x");
  const usdcDecimals = opts?.usdcDecimals ?? 6;

  let biggest = null as (AnyObj & { _rawBI?: bigint }) | null;
  for (const t of transfers) {
    const bi = safeBigInt(t?.value);
    const withBi = { ...t, _rawBI: bi ?? undefined };
    if (!biggest) biggest = withBi;
    else if ((withBi._rawBI ?? 0n) > (biggest._rawBI ?? 0n)) biggest = withBi;
  }

  const flags: string[] = Array.isArray(obj.flags) ? obj.flags.map(String) : [];
  const heurFlags: string[] = [...flags];

  if (status !== "success") heurFlags.push("Transaction not successful (or status unknown).");
  if (kind === "unknown") heurFlags.push("Function decode unknown (ABI not available / unrecognized).");
  if (!to) heurFlags.push("Missing `to` address (contract creation or incomplete data).");

  const chips = [
    { label: "Status", value: status },
    { label: "Method", value: kind },
    { label: "Value", value: `${valueEth} ETH` },
    { label: "Transfers", value: String(transferCount) },
  ];

  const highlights: string[] = [
    `From ${trunc(from)} → ${trunc(to || "N/A")}`,
    `Decoded input: ${kind}`,
    transferCount
      ? `Token transfers: ${transferCount} (largest logged transfer included below)`
      : "No token transfers detected in logs.",
  ];

  if (biggest) {
    const tokenAddr = lower(biggest.token);
    const tokenLabel = tokenAddr && tokenAddr === usdc ? "USDC" : biggest.token ? trunc(String(biggest.token), 4) : "token";

    const amount =
      tokenAddr && tokenAddr === usdc
        ? `${formatTokenAmount(String(biggest.value ?? "0"), usdcDecimals)} ${tokenLabel}`
        : `${String(biggest.value ?? "0")} ${tokenLabel} (raw)`;

    highlights.push(`Largest transfer: ${amount} (${trunc(String(biggest.from))} → ${trunc(String(biggest.to))})`);
  }

  const headline = hash ? `Tx ${trunc(hash, 8)}` : "Transaction Summary";
  const paragraph = `This transaction is **${status}**. It calls **${kind}** ${to ? `on **${trunc(to)}**` : ""} with **${valueEth} ETH** value and **${transferCount}** token-transfer log(s).`;

  return {
    headline,
    paragraph,
    chips,
    highlights,
    flags: Array.from(new Set(heurFlags)),
  };
}

export function summarizeWallet(raw: unknown, opts?: { usdcAddress?: string }): AgentSummary {
  const obj = isObj(raw) ? raw : {};
  const address = String(obj.address ?? "");
  const activity = String(obj.profile?.activity ?? "unknown");

  const eth = String(obj.balances?.eth?.eth ?? "0");
  const usdc = String(obj.balances?.usdc?.usdc ?? "0");

  const transfers: AnyObj[] = Array.isArray(obj.recentUsdcTransfers?.transfers) ? obj.recentUsdcTransfers.transfers : [];
  const transferCount = transfers.length;

  const lastTx = last(transfers);
  const addrL = lower(address);
  const dir =
    lastTx && addrL
      ? lower(lastTx.from) === addrL
        ? "outgoing"
        : lower(lastTx.to) === addrL
          ? "incoming"
          : "unknown"
      : "none";

  const flags: string[] = [];
  const usdcN = safeNum(usdc) ?? 0;
  const ethN = safeNum(eth) ?? 0;

  if (activity === "active" && transferCount >= 10) flags.push("High recent USDC activity (many transfers).");
  if (usdcN === 0 && ethN === 0) flags.push("Wallet appears empty on this chain snapshot.");
  if (activity === "inactive" && transferCount === 0) flags.push("No recent USDC activity in scanned window.");

  const chips = [
    { label: "Activity", value: activity },
    { label: "ETH", value: eth },
    { label: "USDC", value: usdc },
    { label: "USDC txns", value: String(transferCount) },
  ];

  const highlights: string[] = [
    `ETH balance: ${eth}`,
    `USDC balance: ${usdc}`,
    `Recent USDC transfers (window): ${transferCount}${dir !== "none" ? ` · last: ${dir}` : ""}`,
  ];

  if (lastTx?.txHash) highlights.push(`Last USDC tx: ${trunc(String(lastTx.txHash), 8)}`);

  const headline = address ? `Wallet ${trunc(address)}` : "Wallet Summary";
  const paragraph = `This wallet looks **${activity}** on Base Sepolia with **${eth} ETH** and **${usdc} USDC**. ${transferCount ? `It has ${transferCount} recent USDC transfer(s).` : "No recent USDC transfers were found."}`;

  return { headline, paragraph, chips, highlights, flags };
}
