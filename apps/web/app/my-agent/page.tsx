// /web/app/my-agent/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { createPublicClient, http, type Address } from "viem";
import { baseSepolia } from "@/lib/chain";
import { agentRegistryAbi } from "@/lib/agentRegistryAbi";
import { env } from "@/lib/env";
import { useEvmWallet } from "@/lib/useEvmWallet";

const rpcUrl = env.rpcUrl || "https://sepolia.base.org";
const registryAddress = (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS || env.agentRegistryAddress) as
  | Address
  | undefined;
const explorerBase = "https://sepolia.basescan.org/tx/";

export default function MyAgentPage() {
  const { address, chainId, isConnected, walletClient, switchToBaseSepolia, connect } = useEvmWallet();
  const wrongChain = isConnected && chainId !== baseSepolia.id;

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: baseSepolia,
        transport: http(rpcUrl),
      }),
    [],
  );

  const [metadataUri, setMetadataUri] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [lastTx, setLastTx] = useState<string | null>(null);

  const agentQuery = useQuery({
    queryKey: ["agent-profile", address],
    enabled: Boolean(address && registryAddress),
    queryFn: async () => {
      const agent = await publicClient.readContract({
        address: registryAddress as Address,
        abi: agentRegistryAbi,
        functionName: "agents",
        args: [address as Address],
      });
      const avgScaled = await publicClient.readContract({
        address: registryAddress as Address,
        abi: agentRegistryAbi,
        functionName: "getAvgRatingScaled",
        args: [address as Address],
      });
      return {
        agent,
        avg: Number(avgScaled) / 1_000_000,
      };
    },
  });

  useEffect(() => {
    if (agentQuery.data?.agent?.metadataUri) {
      setMetadataUri(agentQuery.data.agent.metadataUri);
    }
  }, [agentQuery.data?.agent?.metadataUri]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!walletClient || !address) throw new Error("Connect wallet first");
      if (!registryAddress) throw new Error("Missing NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS");
      const fnName = agentQuery.data?.agent?.createdAt && Number(agentQuery.data.agent.createdAt) > 0 ? "updateAgent" : "registerAgent";
      const txHash = await walletClient.writeContract({
        address: registryAddress,
        abi: agentRegistryAbi,
        functionName: fnName,
        args: [metadataUri],
        chain: baseSepolia,
        account: address as Address,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await agentQuery.refetch();
      setLastTx(txHash);
      return txHash;
    },
    onMutate: () => setStatus("Saving profile…"),
    onSuccess: () => setStatus("Profile saved"),
    onError: (err) => {
      setStatus(null);
      setLastTx(null);
      console.error(err);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async (nextActive: boolean) => {
      if (!walletClient || !address) throw new Error("Connect wallet first");
      if (!registryAddress) throw new Error("Missing NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS");
      const txHash = await walletClient.writeContract({
        address: registryAddress,
        abi: agentRegistryAbi,
        functionName: "setActive",
        args: [nextActive],
        chain: baseSepolia,
        account: address as Address,
      });
      await publicClient.waitForTransactionReceipt({ hash: txHash });
      await agentQuery.refetch();
      setLastTx(txHash);
      return txHash;
    },
    onMutate: (next) => setStatus(next ? "Activating agent…" : "Deactivating agent…"),
    onSuccess: () => setStatus("Status updated"),
    onError: (err) => {
      setStatus(null);
      setLastTx(null);
      console.error(err);
    },
  });

  if (!registryAddress) {
    return <div className="card">Set NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS to manage your agent.</div>;
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <div>
            <h2>My Agent</h2>
            <div className="small mono">{registryAddress}</div>
          </div>
          {status && <span className="small" style={{ color: "#2563eb" }}>{status}</span>}
        </div>
        {!isConnected ? (
          <button onClick={() => connect()}>Connect MetaMask</button>
        ) : (
          <>
            {wrongChain && <button onClick={() => switchToBaseSepolia()}>Switch to Base Sepolia</button>}
            <label>Metadata URI (IPFS/Arweave/GitHub JSON)</label>
            <input value={metadataUri} onChange={(e) => setMetadataUri(e.target.value)} placeholder="ipfs://..." />
            <div className="row" style={{ gap: 8 }}>
              <button disabled={saveMutation.isPending || wrongChain} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? "Saving…" : "Save metadata"}
              </button>
              <button
                disabled={toggleMutation.isPending || agentQuery.isFetching || wrongChain}
                onClick={() => toggleMutation.mutate(!(agentQuery.data?.agent?.active ?? false))}
              >
                {toggleMutation.isPending
                  ? "Updating…"
                  : agentQuery.data?.agent?.active
                    ? "Deactivate"
                    : "Activate"}
              </button>
            </div>
            {lastTx && (
              <div className="small">
                tx:{" "}
                <a href={`${explorerBase}${lastTx}`} target="_blank" rel="noreferrer" className="mono">
                  {lastTx.slice(0, 10)}…
                </a>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Profile</strong>
          {address && (
            <a className="small" href={`/agents/${address}`} target="_blank" rel="noreferrer">
              View public page
            </a>
          )}
        </div>
        {agentQuery.isLoading && <span className="small">Loading agent…</span>}
        {agentQuery.data && (
          <div className="grid">
            <div className="stack">
              <span className="small">Active</span>
              <span>{agentQuery.data.agent.active ? "Yes" : "No"}</span>
            </div>
            <div className="stack">
              <span className="small">Job count</span>
              <span>{Number(agentQuery.data.agent.jobCount)}</span>
            </div>
            <div className="stack">
              <span className="small">Feedback count</span>
              <span>{Number(agentQuery.data.agent.feedbackCount)}</span>
            </div>
            <div className="stack">
              <span className="small">Avg rating</span>
              <span>{agentQuery.data.avg > 0 ? agentQuery.data.avg.toFixed(2) : "N/A"}</span>
            </div>
            <div className="stack">
              <span className="small">Metadata</span>
              <span className="mono small">{agentQuery.data.agent.metadataUri || "not set"}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
