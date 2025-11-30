// /web/app/api/registry/agents/route.ts
import { createPublicClient, http, parseAbiItem, type Address } from "viem";
import { baseSepolia } from "@/lib/chain";
import { env } from "@/lib/env";
import { agentRegistryAbi } from "@/lib/agentRegistryAbi";
import { jsonError } from "@/lib/apiError";

export const runtime = "nodejs";

const agentEvents = [
  parseAbiItem("event AgentRegistered(address indexed agent, string metadataUri)"),
  parseAbiItem("event AgentUpdated(address indexed agent, string metadataUri)"),
  parseAbiItem("event AgentAutoCreated(address indexed agent)"),
  parseAbiItem("event AgentDeactivated(address indexed agent)"),
];

export async function GET(req: Request) {
  const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL || env.rpcUrl;
  const registryAddress = (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS || env.agentRegistryAddress) as
    | Address
    | undefined;
  const deployBlockStr = process.env.REGISTRY_DEPLOY_BLOCK ?? "0";

  const url = new URL(req.url);
  const limitParam = Number(url.searchParams.get("limit") ?? 50);
  const limit = Number.isFinite(limitParam) ? Math.min(Math.max(Math.floor(limitParam), 1), 200) : 50;

  if (!rpcUrl || !registryAddress) {
    return jsonError(
      "MISSING_ENV",
      "Missing RPC_URL/NEXT_PUBLIC_RPC_URL or NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS",
      500,
    );
  }

  let fromBlock: bigint;
  try {
    fromBlock = BigInt(deployBlockStr || "0");
  } catch {
    return jsonError("INVALID_FROM_BLOCK", "REGISTRY_DEPLOY_BLOCK must be a number", 400);
  }

  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  let toBlock: bigint;
  try {
    toBlock = await publicClient.getBlockNumber();
  } catch (err) {
    return jsonError("RPC_ERROR", (err as Error)?.message ?? "Failed to fetch block number", 500);
  }

  try {
    const agentSet = new Set<`0x${string}`>();
    const CHUNK_SIZE = 200_000n;
    let cursor = fromBlock;

    while (cursor <= toBlock) {
      const chunkTo = cursor + CHUNK_SIZE - 1n <= toBlock ? cursor + CHUNK_SIZE - 1n : toBlock;
      const logResults = await Promise.all(
        agentEvents.map((event) =>
          publicClient.getLogs({
            address: registryAddress,
            event,
            fromBlock: cursor,
            toBlock: chunkTo,
          }),
        ),
      );

      for (const logs of logResults) {
        for (const log of logs) {
          const agent = (log as any)?.args?.agent as `0x${string}` | undefined;
          if (agent) agentSet.add(agent.toLowerCase() as `0x${string}`);
        }
      }

      cursor = chunkTo + 1n;
    }

    const agents = await Promise.all(
      Array.from(agentSet).map(async (agent) => {
        const [agentStruct, avgScaled] = await Promise.all([
          publicClient.readContract({
            address: registryAddress,
            abi: agentRegistryAbi,
            functionName: "agents",
            args: [agent as Address],
          }),
          publicClient.readContract({
            address: registryAddress,
            abi: agentRegistryAbi,
            functionName: "getAvgRatingScaled",
            args: [agent as Address],
          }),
        ]);

        const avgRatingScaled = (avgScaled as bigint | number | string)?.toString?.() ?? String(avgScaled ?? "0");
        const avgRating = Number(avgRatingScaled) / 1_000_000;

        return {
          address: agent as `0x${string}`,
          active: Boolean((agentStruct as any)?.active),
          metadataUri: String((agentStruct as any)?.metadataUri ?? ""),
          jobCount: Number((agentStruct as any)?.jobCount ?? 0),
          feedbackCount: Number((agentStruct as any)?.feedbackCount ?? 0),
          avgRating,
          avgRatingScaled,
          createdAt: Number((agentStruct as any)?.createdAt ?? 0),
          lastUpdate: Number((agentStruct as any)?.lastUpdate ?? 0),
          autoCreated: Boolean((agentStruct as any)?.autoCreated),
        };
      }),
    );

    agents.sort((a, b) => {
      if (Number(b.active) !== Number(a.active)) return Number(b.active) - Number(a.active);
      if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
      return b.jobCount - a.jobCount;
    });

    const sliced = agents.slice(0, limit);

    return Response.json({
      fromBlock: fromBlock.toString(),
      toBlock: toBlock.toString(),
      total: agents.length,
      agents: sliced,
    });
  } catch (err) {
    return jsonError("REGISTRY_QUERY_FAILED", (err as Error)?.message ?? "Failed to load agents", 500);
  }
}
