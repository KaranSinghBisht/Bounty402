import { tool } from 'ai';
import { z } from 'zod';
import {
	createPublicClient,
	formatEther,
	formatUnits,
	http,
	parseAbi,
	parseAbiItem,
	type Address,
} from 'viem';
import { baseSepolia } from 'viem/chains';

// Forces the executable-tool overload even if TS thinks your Zod instance differs
const defineTool = <P extends z.ZodTypeAny, R>(def: {
	description: string;
	inputSchema: P;
	execute: (args: z.infer<P>) => Promise<R> | R;
}) => tool(def as any);

const erc20Abi = parseAbi([
	'function balanceOf(address) view returns (uint256)',
	'event Transfer(address indexed from, address indexed to, uint256 value)',
]);
const transferEvent = parseAbiItem(
	'event Transfer(address indexed from, address indexed to, uint256 value)',
);

const AddressSchema = z.object({
	address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});
type AddressParams = z.infer<typeof AddressSchema>;

const TransfersSchema = z.object({
	address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
	maxBlocks: z.number().int().positive().max(50_000).default(20_000),
});
type TransfersParams = z.infer<typeof TransfersSchema>;

const WalletEnvSchema = z.object({
	RPC_URL: z.string().min(1),
	USDC_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
});

export function makeWalletTools(env: Env) {
	const validated = WalletEnvSchema.parse({
		RPC_URL: env.RPC_URL,
		USDC_ADDRESS: env.USDC_ADDRESS,
	});

	const client = createPublicClient({
		chain: baseSepolia,
		transport: http(validated.RPC_URL),
	});

	const usdc = validated.USDC_ADDRESS as Address;

	return {
		getEthBalance: defineTool({
			description: 'Get native ETH balance of an address on Base Sepolia',
			inputSchema: AddressSchema,
			execute: async (params: AddressParams) => {
				const address = params.address as Address;
				const bal = await client.getBalance({ address });
				return { address: params.address, wei: bal.toString(), eth: formatEther(bal) };
			},
		}),

		getUsdcBalance: defineTool({
			description: 'Get USDC (Base Sepolia) ERC20 balance of an address',
			inputSchema: AddressSchema,
			execute: async (params: AddressParams) => {
				const address = params.address as Address;
				const bal = await client.readContract({
					address: usdc,
					abi: erc20Abi,
					functionName: 'balanceOf',
					args: [address],
				});
				return { address: params.address, raw: bal.toString(), usdc: formatUnits(bal, 6) };
			},
		}),

		getRecentUsdcTransfers: defineTool({
			description: 'Get recent USDC Transfer logs involving an address (Base Sepolia)',
			inputSchema: TransfersSchema,
			execute: async (params: TransfersParams) => {
				const address = params.address;
				const maxBlocks = params.maxBlocks;
				const toBlock = await client.getBlockNumber();
				const fromBlock = toBlock > BigInt(maxBlocks) ? toBlock - BigInt(maxBlocks) : 0n;

				const logs = await client.getLogs({
					address: usdc,
					event: transferEvent,
					fromBlock,
					toBlock,
				});

				const addr = address.toLowerCase();
				const filtered = logs
					.filter((l) => {
						const from = l.args.from?.toLowerCase();
						const to = l.args.to?.toLowerCase();
						return from === addr || to === addr;
					})
					.slice(-50)
					.map((l) => ({
						blockNumber: l.blockNumber?.toString(),
						txHash: l.transactionHash,
						from: l.args.from,
						to: l.args.to,
						value: formatUnits(l.args.value ?? 0n, 6),
					}));

				return {
					address,
					fromBlock: fromBlock.toString(),
					toBlock: toBlock.toString(),
					transfers: filtered,
				};
			},
		}),
	};
}
