export {};

declare global {
	interface Env {
		AI_PROVIDER: 'google';
		AI_PROVIDER_API_KEY: string;
		MODEL_ID: string;

		RPC_URL: string;
		CHAIN_ID: string;
		USDC_ADDRESS: `0x${string}`;
		BASESCAN_API_KEY?: string;

		AGENT: DurableObjectNamespace;
		MCP_SERVICE: Fetcher;
	}
}
