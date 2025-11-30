// /web/app/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPublicClient, decodeEventLog, formatUnits, http, keccak256, parseUnits, toBytes, type Address } from "viem";
import { baseSepolia } from "../lib/chain";
import { bountyAbi, erc20Abi } from "../lib/abi";
import { useMutation, useQuery } from "@tanstack/react-query";
import { env } from "../lib/env";
import { useEvmWallet } from "@/lib/useEvmWallet";
import { agentRegistryAbi } from "@/lib/agentRegistryAbi";

type Hash = `0x${string}`;

const rpcUrl = env.rpcUrl || "https://sepolia.base.org";
const bountyAddress = (process.env.NEXT_PUBLIC_BOUNTY402_ADDRESS || env.bounty402Address) as Hash | undefined;
const usdcAddress = (process.env.NEXT_PUBLIC_USDC_ADDRESS || env.usdcAddress) as Hash | undefined;
const submitterAddress = (process.env.NEXT_PUBLIC_SUBMITTER_ADDRESS || env.submitterAddress) as Hash | undefined;
const validatorAddress = (process.env.NEXT_PUBLIC_VALIDATOR_ADDRESS || env.validatorAddress) as Hash | undefined;
const registryAddress = (process.env.NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS || env.agentRegistryAddress) as Hash | undefined;
const chainIdEnv = Number(process.env.NEXT_PUBLIC_CHAIN_ID || env.chainId || baseSepolia.id);
const BOUNTY_CREATED_TOPIC0 = keccak256(toBytes("BountyCreated(uint256,address,address,uint256,uint64,bytes32)"));
const explorerBase = "https://sepolia.basescan.org/tx/";
const SAMPLE_TXS: Hash[] = [
  "0x122e259d5cf722bccd227fc853537df12c4b58e7c7fd6b3382211cf8e592f4e5",
];

function shortHash(h?: string) {
  if (!h) return "";
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

export default function Page() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { address, chainId, isConnected, walletClient, connect, switchToBaseSepolia } = useEvmWallet();
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

  const [bountyId, setBountyId] = useState<number | null>(null);
  const [createTx, setCreateTx] = useState<Hash | null>(null);
  const [txHashInput, setTxHashInput] = useState<Hash | "">("");
  const [submissionInfo, setSubmissionInfo] = useState<{
    submissionId: number;
    artifactHash: Hash;
    submitTxHash: Hash;
    sessionId: string;
    txSummary: any;
  } | null>(null);
  const [claimInfo, setClaimInfo] = useState<{
    signature: Hash;
    claimTxHash: Hash;
    verifyDigest?: Hash;
    jobId?: Hash;
    jobTxHash?: Hash;
    jobError?: string | null;
    requestId?: string;
    x402?: any;
  } | null>(null);
  const [statusLine, setStatusLine] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; message: string } | null>(null);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackCommentUri, setFeedbackCommentUri] = useState("");
  const [feedbackTx, setFeedbackTx] = useState<Hash | null>(null);
  const txLink = txHashInput && /^0x[a-fA-F0-9]{64}$/.test(txHashInput) ? `${explorerBase}${txHashInput}` : null;

  const showErrorToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message });
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

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
        account: address as Address,
      });
      const approveReceipt = await publicClient.waitForTransactionReceipt({ hash: approveHash });
      if (approveReceipt.status !== "success") {
        throw new Error("USDC approve reverted");
      }

      const sim = await publicClient.simulateContract({
        address: bountyAddress,
        abi: bountyAbi,
        functionName: "createBountyWithValidator",
        args: [usdcAddress, rewardUnits, deadlineTs, specHash, validatorAddress],
        account: address as Address,
      });

      const createHash = await walletClient.writeContract(sim.request);
      const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });
      if (receipt.status !== "success") {
        throw new Error("createBountyWithValidator reverted (check USDC balance/allowance)");
      }

      const createdId = Number(sim.result);

      setBountyId(createdId);
      setCreateTx(createHash);
      return createHash;
    },
    onMutate: () => setStatusLine("Creating bounty…"),
    onSuccess: () => setStatusLine("Bounty created"),
    onError: (err) => {
      setStatusLine(null);
      showErrorToast(err instanceof Error ? err.message : String(err));
    },
  });

  const runMutation = useMutation({
    mutationFn: async () => {
      if (bountyId == null) throw new Error("Create a bounty first");
      if (!txHashInput || !/^0x[a-fA-F0-9]{64}$/.test(txHashInput)) throw new Error("Enter a valid tx hash");

      const res = await fetch("/api/agent/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bountyId, txHash: txHashInput }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof json.error === "string" ? json.error : JSON.stringify(json.error ?? json);
        throw new Error(msg || `Request failed (${res.status})`);
      }

      setSubmissionInfo({
        submissionId: json.submissionId,
        artifactHash: json.artifactHash,
        submitTxHash: json.submitTxHash,
        sessionId: json.sessionId,
        txSummary: json.txSummary,
      });

      return json;
    },
    onMutate: () => setStatusLine("Running agent…"),
    onSuccess: () => setStatusLine("Agent run submitted"),
    onError: (err) => {
      setStatusLine(null);
      showErrorToast(err instanceof Error ? err.message : String(err));
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
          client: address,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error("verify-claim failed:", res.status, json);
        const msg = json?.error?.message ?? json?.error ?? JSON.stringify(json);
        throw new Error(msg || `Request failed (${res.status})`);
      }
      setClaimInfo({
        signature: json.signature,
        claimTxHash: json.claimTxHash,
        verifyDigest: json.verifyDigest,
        jobId: json.jobId,
        jobTxHash: json.jobTxHash,
        jobError: json.jobError ?? null,
        requestId: json.requestId,
        x402: json.x402 ?? null,
      });
      setFeedbackTx(null);
      setFeedbackCommentUri("");
      setFeedbackRating(5);
      return json;
    },
    onMutate: () => setStatusLine("Verifying claim…"),
    onSuccess: () => setStatusLine("Claim verified and submitted"),
    onError: (err) => {
      setStatusLine(null);
      showErrorToast(err instanceof Error ? err.message : String(err));
    },
  });

  const feedbackMutation = useMutation({
    mutationFn: async () => {
      if (!claimInfo?.jobId) throw new Error("Missing jobId");
      if (!walletClient || !address) throw new Error("Connect wallet first");
      if (wrongChain) throw new Error("Wrong network. Switch MetaMask to Base Sepolia (84532).");
      if (!registryAddress) throw new Error("Missing NEXT_PUBLIC_AGENT_REGISTRY_ADDRESS");

      const txHash = await walletClient.writeContract({
        address: registryAddress,
        abi: agentRegistryAbi,
        functionName: "submitFeedback",
        args: [claimInfo.jobId, feedbackRating, feedbackCommentUri],
        chain: baseSepolia,
        account: address as Address,
      });

      await publicClient.waitForTransactionReceipt({ hash: txHash });
      setFeedbackTx(txHash);
      return txHash;
    },
    onMutate: () => {
      setStatusLine("Submitting feedback…");
      setFeedbackTx(null);
    },
    onSuccess: () => setStatusLine("Feedback submitted"),
    onError: (err) => {
      setStatusLine(null);
      showErrorToast(err instanceof Error ? err.message : String(err));
    },
  });

  const balancesQuery = useQuery({
    queryKey: ["balances", address, submitterAddress],
    queryFn: async () => {
      if (!usdcAddress || !bountyAddress) return null;
      const [contractBal, creatorBal, submitterBal, decimalsRaw] = await Promise.all([
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
      const dec = Number(decimalsRaw);
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
          {!mounted ? <span className="small">Loading…</span> : connected ? (
            <span className="mono">{shortHash(address ?? undefined)}</span>
          ) : (
            <button disabled={createMutation.isPending} onClick={() => connect()}>
              Connect MetaMask
            </button>
          )}
        </div>
        {statusLine && (
          <div className="small" style={{ color: "#2563eb" }}>
            {statusLine}
          </div>
        )}
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
              <button onClick={() => switchToBaseSepolia()}>Switch to Base Sepolia</button>
            )}
            <button disabled={createMutation.isPending || wrongChain} onClick={() => createMutation.mutate()}>
              {createMutation.isPending ? "Creating…" : "Approve + Create"}
            </button>
            {bountyId != null && (
              <div className="small">
                bountyId: <span className="mono">{bountyId}</span>
                <br />
                tx:{" "}
                {createTx ? (
                  <a href={`${explorerBase}${createTx}`} target="_blank" rel="noreferrer" className="mono">
                    {shortHash(createTx)}
                  </a>
                ) : (
                  <span className="mono">{shortHash(createTx || undefined)}</span>
                )}
              </div>
            )}
            {createMutation.error && <div className="small" style={{ color: "#b91c1c" }}>{`${createMutation.error}`}</div>}
          </div>

          <div className="stack card">
            <h3>Step B · Run tx-explainer</h3>

            <label>Transaction hash (Base Sepolia)</label>
            <input
              className="mono"
              placeholder="0x…"
              value={txHashInput}
              onChange={(e) => setTxHashInput(e.target.value as any)}
            />
            <div className="row" style={{ gap: 8 }}>
              <button
                disabled={!SAMPLE_TXS.length}
                onClick={() => setTxHashInput(SAMPLE_TXS[0])}
              >
                Use sample tx
              </button>

              {txLink && (
                <a href={txLink} target="_blank" rel="noreferrer" className="mono small">
                  Open tx ↗
                </a>
              )}
            </div>

            <button
              disabled={runMutation.isPending || bountyId == null || createMutation.isPending}
              onClick={() => runMutation.mutate()}
            >
              {runMutation.isPending ? "Submitting…" : "Run Agent (server)"}
            </button>
            {submissionInfo && (
              <div className="small stack" style={{ gap: 8 }}>
                <div>
                  submissionId: <span className="mono">{submissionInfo.submissionId}</span>
                  <br />
                  artifactHash: <span className="mono">{shortHash(submissionInfo.artifactHash)}</span>
                  <br />
                  sessionId: <span className="mono">{submissionInfo.sessionId}</span>
                  <br />
                  tx:{" "}
                  <a
                    href={`${explorerBase}${submissionInfo.submitTxHash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mono"
                  >
                    {shortHash(submissionInfo.submitTxHash)}
                  </a>
                </div>

                <details>
                  <summary className="mono">txSummary JSON</summary>
                  <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 8 }}>
                    {JSON.stringify(submissionInfo.txSummary, null, 2)}
                  </pre>
                </details>
              </div>
            )}
            {runMutation.error && <div className="small" style={{ color: "#b91c1c" }}>{`${runMutation.error}`}</div>}
          </div>

          <div className="stack card">
            <h3>Step C · Verify + Claim</h3>
            <button
              disabled={claimMutation.isPending || !submissionInfo || runMutation.isPending}
              onClick={() => claimMutation.mutate()}
            >
              {claimMutation.isPending ? "Verifying…" : "Verify + Claim"}
            </button>
            {claimInfo && (
              <div className="small">
                signature: <span className="mono">{shortHash(claimInfo.signature)}</span>
                <br />
                claim tx:{" "}
                <a href={`${explorerBase}${claimInfo.claimTxHash}`} target="_blank" rel="noreferrer" className="mono">
                  {shortHash(claimInfo.claimTxHash)}
                </a>
                {claimInfo.jobTxHash && (
                  <>
                    <br />
                    job tx:{" "}
                    <a href={`${explorerBase}${claimInfo.jobTxHash}`} target="_blank" rel="noreferrer" className="mono">
                      {shortHash(claimInfo.jobTxHash)}
                    </a>
                  </>
                )}
                {claimInfo.jobId && (
                  <>
                    <br />
                    job id: <span className="mono">{shortHash(claimInfo.jobId)}</span>
                  </>
                )}
                {claimInfo.jobError && (
                  <>
                    <br />
                    <span style={{ color: "#b45309" }}>job warning: {claimInfo.jobError}</span>
                  </>
                )}
                {!claimInfo.jobTxHash && (
                  <div className="small" style={{ color: "#b91c1c", marginTop: 8 }}>
                    Job registration missing; feedback may fail. Check worker logs/registrar setup.
                  </div>
                )}
                {claimInfo.x402 && (
                  <details style={{ marginTop: 8 }}>
                    <summary className="mono">x402 quote</summary>
                    <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", marginTop: 8 }}>
                      {JSON.stringify(claimInfo.x402, null, 2)}
                    </pre>
                  </details>
                )}
                {claimInfo.requestId && (
                  <div className="small mono" style={{ marginTop: 8 }}>
                    requestId: {claimInfo.requestId}
                  </div>
                )}
              </div>
            )}
            {claimInfo?.jobId && (
              <div className="card stack" style={{ marginTop: 12, gap: 8 }}>
                <h4>Feedback</h4>
                <label>Rating</label>
                <select value={feedbackRating} onChange={(e) => setFeedbackRating(Number(e.target.value))}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
                <label>Comment URI (optional)</label>
                <input
                  placeholder="ipfs://... or https://..."
                  value={feedbackCommentUri}
                  onChange={(e) => setFeedbackCommentUri(e.target.value)}
                />
                <button
                  disabled={feedbackMutation.isPending || wrongChain || !connected}
                  onClick={() => feedbackMutation.mutate()}
                >
                  {feedbackMutation.isPending ? "Submitting…" : "Submit feedback"}
                </button>
                {feedbackTx && (
                  <div className="small">
                    tx:{" "}
                    <a href={`${explorerBase}${feedbackTx}`} target="_blank" rel="noreferrer" className="mono">
                      {shortHash(feedbackTx)}
                    </a>
                  </div>
                )}
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

      {toast && (
        <div
          key={toast.id}
          style={{
            position: "fixed",
            bottom: 16,
            right: 16,
            background: "#fef2f2",
            color: "#991b1b",
            padding: "12px 14px",
            borderRadius: 8,
            boxShadow: "0 4px 24px rgba(0,0,0,0.15)",
            maxWidth: 320,
          }}
        >
          <strong style={{ display: "block", marginBottom: 4 }}>Error</strong>
          <span className="small">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
