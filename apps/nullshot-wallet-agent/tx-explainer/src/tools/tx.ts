import { z } from "zod";
import { tool } from "ai";
import {
  createPublicClient,
  http,
  decodeFunctionData,
  parseAbi,
  type Hex,
  type Address,
} from "viem";
import { baseSepolia } from "viem/chains";

type TxEnv = Pick<Env, "RPC_URL" | "CHAIN_ID">;

const HashSchema = z.object({
  hash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

function getClient(env: TxEnv) {
  return createPublicClient({
    chain: baseSepolia,
    transport: http(env.RPC_URL),
  });
}

const ERC20_ABI = parseAbi([
  "function transfer(address to, uint256 value)",
  "function approve(address spender, uint256 value)",
  "function transferFrom(address from, address to, uint256 value)",
]);

const TransferTopic =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

function sanitize(value: any): any {
  if (typeof value === "bigint") return value.toString();
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v)]));
  }
  return value;
}

export function makeTxTools(env: TxEnv) {
  const client = getClient(env);

  async function erc20TransfersInTx(hash: Hex) {
    const receipt = await client.getTransactionReceipt({ hash });
    return receipt.logs
      .filter((l) => l.topics?.[0]?.toLowerCase() === TransferTopic)
      .map((l) => ({
        token: l.address,
        from: `0x${l.topics[1]?.slice(26)}`,
        to: `0x${l.topics[2]?.slice(26)}`,
        value: BigInt(l.data as Hex).toString(),
        logIndex: l.logIndex,
      }));
  }

  const getTransaction = tool({
    description: "Fetch a transaction by hash on Base Sepolia",
    inputSchema: HashSchema,
    execute: async ({ hash }: z.infer<typeof HashSchema>) => sanitize(await client.getTransaction({ hash: hash as Hex })),
  });

  const getReceipt = tool({
    description: "Fetch a transaction receipt by hash on Base Sepolia",
    inputSchema: HashSchema,
    execute: async ({ hash }: z.infer<typeof HashSchema>) =>
      sanitize(await client.getTransactionReceipt({ hash: hash as Hex })),
  });

  const decodeTxInputAsErc20 = tool({
    description: "Decode a tx input as an ERC20 transfer/approve/transferFrom if possible",
    inputSchema: z.object({ input: z.string().regex(/^0x[0-9a-fA-F]*$/) }),
    execute: async ({ input }: { input: string }) => {
      try {
        const decoded = decodeFunctionData({ abi: ERC20_ABI, data: input as Hex });
        return sanitize({ ok: true, decoded });
      } catch (e: any) {
        return { ok: false, error: e?.message ?? String(e) };
      }
    },
  });

  const ContractInfoSchema = z.object({
    address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  });

  const getContractInfo = tool({
    description: "Best-effort ERC20 metadata lookup (name/symbol/decimals)",
    inputSchema: ContractInfoSchema,
    execute: async ({ address }: z.infer<typeof ContractInfoSchema>) => {
      const addr = address as Address;

      const abi = parseAbi([
        "function name() view returns (string)",
        "function symbol() view returns (string)",
        "function decimals() view returns (uint8)",
      ]);

      const [name, symbol, decimals] = await Promise.allSettled([
        client.readContract({ address: addr, abi, functionName: "name" }),
        client.readContract({ address: addr, abi, functionName: "symbol" }),
        client.readContract({ address: addr, abi, functionName: "decimals" }),
      ]);

      return {
        address,
        name: name.status === "fulfilled" ? name.value : null,
        symbol: symbol.status === "fulfilled" ? symbol.value : null,
        decimals: decimals.status === "fulfilled" ? Number(decimals.value) : null,
      };
    },
  });

  const getErc20TransfersInTx = tool({
    description: "Extract ERC20 Transfer logs in a transaction",
    inputSchema: HashSchema,
    execute: async ({ hash }: z.infer<typeof HashSchema>) =>
      erc20TransfersInTx(hash as Hex),
  });

  const getTxSummary = tool({
    description: "Structured summary of tx + receipt + decoded ERC20 input + transfers",
    inputSchema: HashSchema,
    execute: async ({ hash }: z.infer<typeof HashSchema>) => {
      const h = hash as Hex;
      const [tx, receipt] = await Promise.all([
        client.getTransaction({ hash: h }),
        client.getTransactionReceipt({ hash: h }),
      ]);

      let decodedInput: any = { kind: "unknown", data: tx.input };
      try {
        const decoded = decodeFunctionData({ abi: ERC20_ABI, data: tx.input });
        decodedInput = sanitize({ kind: "erc20", ...decoded });
      } catch {}

      const summary = {
        chainId: env.CHAIN_ID ? Number(env.CHAIN_ID) : baseSepolia.id,
        hash,
        from: tx.from,
        to: tx.to,
        valueEth: tx.value.toString(),
        status: receipt.status,
        decodedInput,
        transfers: await erc20TransfersInTx(h),
        flags: [],
      };

      return sanitize(summary);
    },
  });

  return {
    getTransaction,
    getReceipt,
    decodeTxInputAsErc20,
    getContractInfo,
    getErc20TransfersInTx,
    getTxSummary,
  };
}
