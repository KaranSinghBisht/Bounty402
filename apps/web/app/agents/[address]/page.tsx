// /web/app/agents/[address]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createPublicClient, http, isAddress, type Address } from "viem";
import { baseSepolia } from "@/lib/chain";
import { env } from "@/lib/env";
import { agentRegistryAbi } from "@/lib/agentRegistryAbi";

const explorerBase = "https://sepolia.basescan.org/address/";

export default function AgentProfilePage({ params }: { params: { address: string } }) {
  const address = params.address;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agentData, setAgentData] = useState<any>(null);
  const [avgRating, setAvgRating] = useState(0);
  const [metadataUri, setMetadataUri] = useState("");
  const [metadataJson, setMetadataJson] = useState<any | null>(null);

  const rpcUrl = useMemo(() => process.env.NEXT_PUBLIC_RPC_URL || env.rpcUrl || null, []);
  const registryAddress = useMemo(
    () => (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS || env.agentRegistryAddress) as Address | undefined,
    [],
  );

  const publicClient = useMemo(
    () => (rpcUrl && registryAddress ? createPublicClient({ chain: baseSepolia, transport: http(rpcUrl) }) : null),
    [registryAddress, rpcUrl],
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!isAddress(address)) {
        setError("Invalid address");
        setLoading(false);
        return;
      }
      if (!publicClient || !registryAddress || !rpcUrl) {
        setError("Missing RPC_URL/NEXT_PUBLIC_RPC_URL or NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [agentStruct, avgScaled] = await Promise.all([
          publicClient.readContract({
            address: registryAddress,
            abi: agentRegistryAbi,
            functionName: "agents",
            args: [address as Address],
          }),
          publicClient.readContract({
            address: registryAddress,
            abi: agentRegistryAbi,
            functionName: "getAvgRatingScaled",
            args: [address as Address],
          }),
        ]);

        const avg = Number(avgScaled) / 1_000_000;
        const uri = String((agentStruct as any)?.metadataUri ?? "");

        setAgentData(agentStruct);
        setAvgRating(avg);
        setMetadataUri(uri);

        if (uri.startsWith("http")) {
          try {
            const res = await fetch(uri, { cache: "no-store" });
            if (res.ok) {
              const json = await res.json().catch(() => null);
              if (!cancelled) setMetadataJson(json);
            }
          } catch {
            // ignore metadata fetch errors
          }
        }
      } catch (err) {
        if (!cancelled) setError((err as Error)?.message ?? "Failed to fetch agent data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [address, publicClient, registryAddress, rpcUrl]);

  if (error) {
    return <div className="card">{error}</div>;
  }

  if (loading) {
    return <div className="card">Loading agent…</div>;
  }

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card stack" style={{ gap: 8 }}>
        <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 className="mono">{address}</h2>
            <div className="small">Agent profile</div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            <CopyButton value={address} />
            <a className="button" href={`${explorerBase}${address}`} target="_blank" rel="noreferrer">
              Open in explorer ↗
            </a>
          </div>
        </div>
      </div>

      <div className="grid">
        <div className="card stack">
          <strong>Reputation</strong>
          <div>Avg rating: {avgRating > 0 ? avgRating.toFixed(2) : "N/A"}</div>
          <div>Jobs: {Number(agentData?.jobCount ?? 0)}</div>
          <div>Feedback: {Number(agentData?.feedbackCount ?? 0)}</div>
        </div>
        <div className="card stack">
          <strong>Status</strong>
          <div>{agentData?.active ? "Active" : "Inactive"}</div>
          <div>Created: {Number(agentData?.createdAt ?? 0)}</div>
          <div>Last update: {Number(agentData?.lastUpdate ?? 0)}</div>
        </div>
      </div>

      <div className="card stack" style={{ gap: 8 }}>
        <strong>Metadata</strong>
        <div className="mono small" style={{ wordBreak: "break-word" }}>
          {metadataUri || "not set"}
        </div>
        {metadataJson && (
          <div className="stack">
            {metadataJson.name && <div><strong>Name:</strong> {metadataJson.name}</div>}
            {metadataJson.description && <div><strong>Description:</strong> {metadataJson.description}</div>}
            {metadataJson.tags?.length ? (
              <div>
                <strong>Tags:</strong> {metadataJson.tags.join(", ")}
              </div>
            ) : null}
            {metadataJson.endpoint && (
              <div>
                <strong>Endpoint:</strong> {metadataJson.endpoint}
              </div>
            )}
            {metadataJson.agentType && (
              <div>
                <strong>Agent type:</strong> {metadataJson.agentType}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="row" style={{ gap: 8 }}>
        <Link className="button" href={`/?agent=${address}`}>
          Use this agent
        </Link>
        <Link className="button" href="/marketplace">
          Back to marketplace
        </Link>
      </div>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
