// /web/lib/env.ts
export const env = {
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? "https://sepolia.base.org",
  chainId: Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 84532),
  bounty402Address: process.env.NEXT_PUBLIC_BOUNTY402_ADDRESS as `0x${string}` | undefined,
  usdcAddress: process.env.NEXT_PUBLIC_USDC_ADDRESS as `0x${string}` | undefined,
  validatorAddress: process.env.NEXT_PUBLIC_VALIDATOR_ADDRESS as `0x${string}` | undefined,
  submitterAddress: process.env.NEXT_PUBLIC_SUBMITTER_ADDRESS as `0x${string}` | undefined,
  agentRegistryAddress: process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS as `0x${string}` | undefined,
  agentRegistryStartBlock: Number(process.env.NEXT_PUBLIC_AGENT_REGISTRY_START_BLOCK ?? 0),
};
