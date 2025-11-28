// /web/app/agents/[address]/page.tsx
import { notFound } from "next/navigation";
import { agentRegistryAbi } from "@/lib/agentRegistryAbi";
import { env } from "@/lib/env";
import { baseSepolia } from "@/lib/chain";
import { createPublicClient, formatUnits, getAddress, http, isAddress, type Address } from "viem";

const rpcUrl = env.rpcUrl || "https://sepolia.base.org";
const registryAddress = (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS || env.agentRegistryAddress) as
  | Address
  | undefined;
const explorerBase = "https://sepolia.basescan.org/tx/";

type JobRow = {
  jobId: string;
  client: Address;
  agent: Address;
  token: Address;
  amountRaw: bigint;
  txHash: `0x${string}` | undefined;
  createdAt?: bigint;
};

export default async function AgentPage({ params }: { params: { address: string } }) {
  if (!registryAddress) {
    return <div className="card">Set NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS to view agents.</div>;
  }

  if (!params.address || !isAddress(params.address)) {
    return notFound();
  }

  const agentAddr = getAddress(params.address);
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const [agent, avgScaled] = await Promise.all([
    publicClient.readContract({
      address: registryAddress,
      abi: agentRegistryAbi,
      functionName: "agents",
      args: [agentAddr],
    }),
    publicClient.readContract({
      address: registryAddress,
      abi: agentRegistryAbi,
      functionName: "getAvgRatingScaled",
      args: [agentAddr],
    }),
  ]);

  const logs = await publicClient.getLogs({
    address: registryAddress,
    event: {
      type: "event",
      name: "JobRegistered",
      inputs: [
        { name: "jobId", type: "bytes32", indexed: true },
        { name: "agent", type: "address", indexed: true },
        { name: "client", type: "address", indexed: true },
        { name: "token", type: "address", indexed: false },
        { name: "amount", type: "uint256", indexed: false },
      ],
    },
    args: { agent: agentAddr },
    fromBlock: BigInt(env.agentRegistryStartBlock || 0),
    toBlock: "latest",
  });

  const recentJobs: JobRow[] = logs.slice(-5).reverse().map((log) => ({
    jobId: log.args.jobId as string,
    agent: log.args.agent as Address,
    client: log.args.client as Address,
    token: log.args.token as Address,
    amountRaw: BigInt(log.args.amount as bigint),
    txHash: log.transactionHash,
  }));

  const avgRating = Number(avgScaled) / 1_000_000;

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2 className="mono">{agentAddr}</h2>
            <div className="small">Trustless Agent Registry</div>
          </div>
          <div className="stack" style={{ alignItems: "flex-end" }}>
            <span className="small">Avg rating</span>
            <strong>{avgRating ? avgRating.toFixed(2) : "N/A"}</strong>
          </div>
        </div>
        <div className="grid">
          <div className="stack">
            <span className="small">Active</span>
            <span>{agent.active ? "Yes" : "No"}</span>
          </div>
          <div className="stack">
            <span className="small">Jobs</span>
            <span>{Number(agent.jobCount)}</span>
          </div>
          <div className="stack">
            <span className="small">Feedback</span>
            <span>{Number(agent.feedbackCount)}</span>
          </div>
          <div className="stack">
            <span className="small">Metadata</span>
            <span className="mono small">{agent.metadataUri || "not set"}</span>
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Recent jobs</strong>
          <span className="small">Showing last {recentJobs.length} jobs</span>
        </div>
        {recentJobs.length === 0 ? (
          <span className="small">No jobs registered yet.</span>
        ) : (
          <div className="stack" style={{ gap: 12 }}>
            {recentJobs.map((job) => (
              <div key={job.jobId} className="card stack">
                <div className="row" style={{ justifyContent: "space-between" }}>
                  <span className="mono small">{job.jobId}</span>
                  {job.txHash && (
                    <a className="small mono" href={`${explorerBase}${job.txHash}`} target="_blank" rel="noreferrer">
                      tx
                    </a>
                  )}
                </div>
                <div className="grid">
                  <div className="stack">
                    <span className="small">Client</span>
                    <span className="mono small">{job.client}</span>
                  </div>
                  <div className="stack">
                    <span className="small">Token</span>
                    <span className="mono small">{job.token}</span>
                  </div>
                  <div className="stack">
                    <span className="small">Amount</span>
                    <span>{formatUnits(job.amountRaw, 6)} (raw {job.amountRaw.toString()})</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
