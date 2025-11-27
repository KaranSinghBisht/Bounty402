// /web/app/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain, useWalletClient } from "wagmi";
import {
  createPublicClient,
  decodeEventLog,
  formatUnits,
  http,
  keccak256,
  parseUnits,
  toBytes,
} from "viem";
import { baseSepolia } from "../lib/chain";
import { bountyAbi, erc20Abi } from "../lib/abi";
import { useMutation, useQuery } from "@tanstack/react-query";

type Hash = `0x${string}`;

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";
const bountyAddress = process.env.NEXT_PUBLIC_BOUNTY402_ADDRESS as Hash | undefined;
const usdcAddress = process.env.NEXT_PUBLIC_USDC_ADDRESS as Hash | undefined;
const submitterAddress = process.env.NEXT_PUBLIC_SUBMITTER_ADDRESS as Hash | undefined;
const validatorAddress = process.env.NEXT_PUBLIC_VALIDATOR_ADDRESS as Hash | undefined;
const chainIdEnv = Number(process.env.NEXT_PUBLIC_CHAIN_ID || baseSepolia.id);
const BOUNTY_CREATED_TOPIC0 = keccak256(toBytes("BountyCreated(uint256,address,address,uint256,uint64,bytes32)"));

function shortHash(h?: string) {
  if (!h) return "";
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: isConnectPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient({ chainId: baseSepolia.id });
  const chainId = useChainId();
  const { switchChain, isPending: isSwitching } = useSwitchChain();
  const connected = mounted && isConnected;
  const wrongChain = connected && chainId !== baseSepolia.id;

  const publicClient = useMemo(
    () =>
      createPublicClient({
        chain: baseSepolia,
        transport: http(rpcUrl),
      }),
    [],
  );

  const [reward, setReward] = useState("0.01");
  const [deadlineDays, setDeadlineDays] = useState(7);
  const [specText, setSpecText] = useState("Build something cool with Bounty402");

  const [agentType, setAgentType] = useState("demo-agent");
  const [prompt, setPrompt] = useState("Summarize the bounty submission.");

  const [bountyId, setBountyId] = useState<number | null>(null);
  const [createTx, setCreateTx] = useState<Hash | null>(null);
  const [submissionInfo, setSubmissionInfo] = useState<{
    submissionId: number;
    artifactHash: Hash;
    txHash: Hash;
    artifact: string;
  } | null>(null);
  const [claimInfo, setClaimInfo] = useState<{ signature: Hash; claimTxHash: Hash; verifyDigest?: Hash } | null>(
    null,
  );

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!walletClient || !address) throw new Error("Connect wallet first");
      if (!bountyAddress || !usdcAddress) throw new Error("Missing contract addresses");
      if (!validatorAddress) throw new Error("Missing NEXT_PUBLIC_VALIDATOR_ADDRESS");
      if (wrongChain) throw new Error("Wrong network. Switch MetaMask to Base Sepolia (84532).");
      const rewardUnits = parseUnits(reward, 6);
      const deadlineTs = BigInt(Math.floor(Date.now() / 1000) + deadlineDays * 24 * 60 * 60);
      const specHash = keccak256(toBytes(specText));

      const approveHash = await walletClient.writeContract({
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [bountyAddress, rewardUnits],
        chain: baseSepolia,
        account: address,
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });

      const createHash = await walletClient.writeContract({
        address: bountyAddress,
        abi: bountyAbi,
        functionName: "createBountyWithValidator",
        args: [usdcAddress, rewardUnits, deadlineTs, specHash, validatorAddress],
        chain: baseSepolia,
        account: address,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
      let createdId: number | null = null;
      try {
        const log = receipt.logs.find(
          (l) =>
            l.address?.toLowerCase() === bountyAddress.toLowerCase() &&
            l.topics?.[0]?.toLowerCase() === BOUNTY_CREATED_TOPIC0.toLowerCase(),
        );

        if (log) {
          const topics = [...log.topics] as [`0x${string}`, ...`0x${string}`[]];
          const decoded = decodeEventLog({
            abi: bountyAbi,
            data: log.data,
            topics,
          });
          if (decoded.eventName === "BountyCreated" && decoded.args) {
            createdId = Number((decoded.args as { bountyId: bigint }).bountyId);
          }
        }
      } catch {
        createdId = null;
      }
      if (createdId === null) {
        const currentId = await publicClient.readContract({
          address: bountyAddress,
          abi: bountyAbi,
          functionName: "bountyCount",
        });
        createdId = Number(currentId);
      }

      setBountyId(createdId);
      setCreateTx(createHash);
      return createHash;
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (bountyId == null) throw new Error("Create a bounty first");
      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bountyId, prompt, agentType }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof json.error === "string" ? json.error : JSON.stringify(json.error ?? json);
        throw new Error(msg || `Request failed (${res.status})`);
      }
      setSubmissionInfo({
        submissionId: json.submissionId,
        artifactHash: json.artifactHash,
        txHash: json.txHash,
        artifact: json.artifact,
      });
      return json;
    },
  });

  const claimMutation = useMutation({
    mutationFn: async () => {
      if (bountyId == null || !submissionInfo) throw new Error("Missing bounty or submission");
      const res = await fetch("/api/agent/verify-claim", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          bountyId,
          submissionId: submissionInfo.submissionId,
          artifactHash: submissionInfo.artifactHash,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("verify-claim failed:", res.status, json);
        const msg = json?.error?.message ?? json?.error ?? JSON.stringify(json);
        throw new Error(msg || `Request failed (${res.status})`);
      }
      setClaimInfo({ signature: json.signature, claimTxHash: json.claimTxHash, verifyDigest: json.verifyDigest });
      return json;
    },
  });

  const balancesQuery = useQuery({
    queryKey: ["balances", address, submitterAddress],
    queryFn: async () => {
      if (!usdcAddress || !bountyAddress) return null;
      const [contractBal, creatorBal, submitterBal, dec] = await Promise.all([
        publicClient.readContract({ address: usdcAddress, abi: erc20Abi, functionName: "balanceOf", args: [bountyAddress] }),
        address
          ? publicClient.readContract({
              address: usdcAddress,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [address],
            })
          : Promise.resolve(0n),
        submitterAddress
          ? publicClient.readContract({
              address: usdcAddress,
              abi: erc20Abi,
              functionName: "balanceOf",
              args: [submitterAddress],
            })
          : Promise.resolve(0n),
        publicClient.readContract({ address: usdcAddress, abi: erc20Abi, functionName: "decimals" }),
      ]);
      return {
        contract: formatUnits(contractBal as bigint, dec as number),
        creator: formatUnits(creatorBal as bigint, dec as number),
        submitter: submitterAddress ? formatUnits(submitterBal as bigint, dec as number) : null,
      };
    },
    refetchInterval: 10_000,
  });

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="card stack">
        <div className="row">
          <strong>Wallet:</strong>
          {!mounted ? (
            <span className="small">Loading…</span>
          ) : connected ? (
            <>
              <span className="mono">{shortHash(address)}</span>
              <button onClick={() => disconnect()}>Disconnect</button>
            </>
          ) : (
            connectors.map((c) => (
              <button key={c.id} disabled={isConnectPending} onClick={() => connect({ connector: c })}>
                Connect {c.name}
              </button>
            ))
          )}
        </div>
        <div className="grid">
          <div className="stack card">
            <h3>Step A · Create bounty</h3>
            <label>Reward (USDC)</label>
            <input value={reward} onChange={(e) => setReward(e.target.value)} />
            <label>Deadline (days)</label>
            <input type="number" value={deadlineDays} onChange={(e) => setDeadlineDays(Number(e.target.value))} />
            <label>Spec</label>
            <textarea value={specText} onChange={(e) => setSpecText(e.target.value)} rows={3} />
            {wrongChain && (
              <button disabled={isSwitching} onClick={() => switchChain({ chainId: baseSepolia.id })}>
                {isSwitching ? "Switching…" : "Switch to Base Sepolia"}
              </button>
            )}
            <button disabled={createMutation.isPending || wrongChain} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "Creating…" : "Approve + Create"}
            </button>
            {bountyId != null && (
              <div className="small">
                bountyId: <span className="mono">{bountyId}</span>
                <br />
                tx: <span className="mono">{shortHash(createTx || undefined)}</span>
              </div>
            )}
            {createMutation.error && <div className="small" style={{ color: "#b91c1c" }}>{`${createMutation.error}`}</div>}
          </div>

          <div className="stack card">
            <h3>Step B · Run agent</h3>
            <label>Agent type</label>
            <select value={agentType} onChange={(e) => setAgentType(e.target.value)}>
              <option value="demo-agent">demo-agent</option>
              <option value="summarizer">summarizer</option>
              <option value="reviewer">reviewer</option>
            </select>
            <label>Prompt</label>
            <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} rows={3} />
            <button disabled={runMutation.isPending || bountyId == null} onClick={() => runMutation.mutate()}>
              {runMutation.isPending ? "Submitting…" : "Run Agent (server)"}
            </button>
            {submissionInfo && (
              <div className="small">
                submissionId: <span className="mono">{submissionInfo.submissionId}</span>
                <br />
                artifactHash: <span className="mono">{shortHash(submissionInfo.artifactHash)}</span>
                <br />
                tx:{" "}
                <a
                  href={`https://sepolia.basescan.org/tx/${submissionInfo.txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="mono"
                >
                  {shortHash(submissionInfo.txHash)}
                </a>
              </div>
            )}
            {runMutation.error && <div className="small" style={{ color: "#b91c1c" }}>{`${runMutation.error}`}</div>}
          </div>

          <div className="stack card">
            <h3>Step C · Verify + Claim</h3>
            <button
              disabled={claimMutation.isPending || !submissionInfo}
              onClick={() => claimMutation.mutate()}
            >
              {claimMutation.isPending ? "Verifying…" : "Verify + Claim"}
            </button>
            {claimInfo && (
              <div className="small">
                signature: <span className="mono">{shortHash(claimInfo.signature)}</span>
                <br />
                claim tx: <span className="mono">{shortHash(claimInfo.claimTxHash)}</span>
              </div>
            )}
            {claimMutation.error && <div className="small" style={{ color: "#b91c1c" }}>{`${claimMutation.error}`}</div>}
          </div>
        </div>
      </div>

      <div className="card stack">
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Balances (USDC)</strong>
          <span className="small">Chain: Base Sepolia (id {chainIdEnv})</span>
        </div>
        {balancesQuery.data ? (
          <div className="grid">
            <div className="stack">
              <span className="small">Contract</span>
              <span className="mono">{balancesQuery.data.contract}</span>
            </div>
            <div className="stack">
              <span className="small">Creator (connected)</span>
              <span className="mono">{balancesQuery.data.creator}</span>
            </div>
            <div className="stack">
              <span className="small">Submitter (server)</span>
              <span className="mono">{balancesQuery.data.submitter ?? "n/a"}</span>
            </div>
          </div>
        ) : (
          <span className="small">Enter env vars to see balances.</span>
        )}
      </div>
    </div>
  );
}
