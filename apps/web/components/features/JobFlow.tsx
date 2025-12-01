// /web/components/features/JobFlow.tsx
"use client";

import Link from "next/link";
import React, { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, Loader2, Play, TerminalSquare } from "lucide-react";
import { createPublicClient, decodeEventLog, http, keccak256, parseUnits, toBytes, type Hex } from "viem";
import type { JobState } from "@/types";
import { cn, truncateHash } from "@/lib/ui-utils";
import { Badge, Button, Card, Input } from "@/components/ui/Primitives";
import { txUrl } from "@/lib/explorer";
import { baseSepolia } from "@/lib/chain";
import { useEvmWallet } from "@/lib/useEvmWallet";
import { bountyAbi } from "@/lib/abi";

const erc20Abi = [
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "approve", stateMutability: "nonpayable", inputs: [{ name: "s", type: "address" }, { name: "a", type: "uint256" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

const bountyCreatedAbi = [
  {
    type: "event",
    name: "BountyCreated",
    inputs: [
      { name: "bountyId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "reward", type: "uint256", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
      { name: "specHash", type: "bytes32", indexed: false },
    ],
    anonymous: false,
  },
] as const;

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Request failed: ${res.status}`);
  }
  return (await res.json()) as T;
}

interface JobFlowProps {
  agentId: string;
  onComplete?: () => void;
  inline?: boolean;
  initialInput?: string;
}

type ProtoLevel = "info" | "success" | "error";
type ProtoEvent = {
  ts: number;
  level: ProtoLevel;
  title: string;
  data?: any;
};

export const JobFlow = ({ agentId, onComplete, inline = false, initialInput }: JobFlowProps) => {
  const [state, setState] = useState<JobState>({
    agentId,
    status: "idle",
  });
  const [inputValue, setInputValue] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState<string>("");
  const [bountyId, setBountyId] = useState<number>(1);
  const [recommended, setRecommended] = useState<number | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState<string>("");

  const [rewardUSDC, setRewardUSDC] = useState("0.01");
  const [deadlineDays, setDeadlineDays] = useState("7");
  const [specText, setSpecText] = useState(`spec:${agentId}:v1`);
  const [traceOpen, setTraceOpen] = useState(true);
  const [trace, setTrace] = useState<ProtoEvent[]>([]);
  const [runDebug, setRunDebug] = useState<any>(null);
  const [verifyDebug, setVerifyDebug] = useState<any>(null);
  const [liveStatus, setLiveStatus] = useState<string>("");

  const { address, isConnected, chainId, connect, switchToBaseSepolia, walletClient } = useEvmWallet();
  const onBaseSepolia = chainId === baseSepolia.id;

  const RPC = process.env.NEXT_PUBLIC_RPC_URL || "https://sepolia.base.org";
  const BOUNTY_ADDR = (process.env.NEXT_PUBLIC_BOUNTY402_ADDRESS || "") as Hex;
  const USDC_ADDR = (process.env.NEXT_PUBLIC_USDC_ADDRESS || "") as Hex;
  const VALIDATOR_ADDR = (process.env.NEXT_PUBLIC_VALIDATOR_ADDRESS || "") as Hex;

  const publicClient = useMemo(() => createPublicClient({ chain: baseSepolia, transport: http(RPC) }), [RPC]);

  const pushTrace = (title: string, level: ProtoLevel = "info", data?: any) => {
    setTrace((prev) => [...prev, { ts: Date.now(), level, title, data }]);
  };

  const parseMaybeJson = (s: string) => {
    try {
      return JSON.parse(s);
    } catch {
      return null;
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/bounty/recommended");
        if (!r.ok) return;
        const j = await r.json();
        if (typeof j.bountyId === "number") {
          setRecommended(j.bountyId);
          setBountyId(j.bountyId);
        }
      } catch {
        // ignore
      }
    })();
  }, []);

  useEffect(() => {
    if (initialInput) setInputValue(initialInput);
  }, [initialInput]);

  const ensureConnectedBase = async () => {
    if (!isConnected) await connect();
    if (!onBaseSepolia) await switchToBaseSepolia();
  };

  const handleCreateBounty = async () => {
    setCreateErr("");
    if (!walletClient) return setCreateErr("Wallet client not available (MetaMask?)");
    if (!BOUNTY_ADDR || !USDC_ADDR || !VALIDATOR_ADDR) {
      return setCreateErr("Missing NEXT_PUBLIC_BOUNTY402_ADDRESS / NEXT_PUBLIC_USDC_ADDRESS / NEXT_PUBLIC_VALIDATOR_ADDRESS");
    }

    try {
      setCreateBusy(true);
      await ensureConnectedBase();
      if (!address) throw new Error("No wallet address after connect.");

      const decimals = (await publicClient.readContract({
        address: USDC_ADDR,
        abi: erc20Abi,
        functionName: "decimals",
      })) as number;

      const rewardRaw = parseUnits(rewardUSDC, decimals);
      const days = Math.max(1, Number(deadlineDays || "7"));
      const deadline = BigInt(Math.floor(Date.now() / 1000) + days * 86400);
      const specHash = keccak256(toBytes(specText || `spec:${agentId}:${Date.now()}`));

      const allowance = (await publicClient.readContract({
        address: USDC_ADDR,
        abi: erc20Abi,
        functionName: "allowance",
        args: [address, BOUNTY_ADDR],
      })) as bigint;

      if (allowance < rewardRaw) {
        const approveHash = await walletClient.writeContract({
          address: USDC_ADDR,
          abi: erc20Abi,
          functionName: "approve",
          args: [BOUNTY_ADDR, rewardRaw],
          account: address,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      const createHash = await walletClient.writeContract({
        address: BOUNTY_ADDR,
        abi: bountyAbi,
        functionName: "createBountyWithValidator",
        args: [USDC_ADDR, rewardRaw, deadline, specHash, VALIDATOR_ADDR],
        account: address,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: createHash });

      let createdId: number | null = null;
      for (const log of receipt.logs) {
        if ((log.address || "").toLowerCase() !== BOUNTY_ADDR.toLowerCase()) continue;
        try {
          const decoded = decodeEventLog({
            abi: bountyCreatedAbi,
            data: log.data,
            topics: log.topics as [`0x${string}`, ...`0x${string}`[]],
          });
          createdId = Number((decoded.args as any).bountyId);
          break;
        } catch {
          // ignore other events
        }
      }

      if (!createdId) {
        const bc = (await publicClient.readContract({
          address: BOUNTY_ADDR,
          abi: bountyAbi,
          functionName: "bountyCount",
        })) as bigint;
        createdId = Number(bc);
      }

      setBountyId(createdId);
      setRecommended(createdId);
      setState((prev) => ({ ...prev, status: "started", bountyId: String(createdId) }));
    } catch (e: any) {
      setCreateErr(e?.message ?? "Create bounty failed");
    } finally {
      setCreateBusy(false);
    }
  };

  const handleStartJob = async () => {
    setError("");
    setState((prev) => ({ ...prev, status: "started", bountyId: String(bountyId) }));
  };

  const handleRunAgent = async () => {
    if (!inputValue) return;
    setError("");
    setRunDebug(null);
    setLiveStatus("Calling agent…");
    pushTrace("Calling agent…", "info", { bountyId, agentId, input: inputValue });
    setState((prev) => ({ ...prev, status: "running" }));

    try {
      const run = await postJson<{
        requestId: string;
        submissionId: number;
        artifactHash: `0x${string}`;
        submitTxHash: `0x${string}`;
        txSummary: any;
        sessionId: string;
      }>("/api/agent/run", {
        bountyId,
        input: inputValue,
        agentType: agentId,
      });

      setRunDebug(run);
      pushTrace("Agent response", "success", {
        requestId: run.requestId,
        submissionId: run.submissionId,
        artifactHash: run.artifactHash,
        submitTxHash: run.submitTxHash,
        sessionId: run.sessionId,
      });

      setState((prev) => ({
        ...prev,
        status: "verifying",
        bountyId: String(bountyId),
        submissionId: run.submissionId,
        artifactHash: run.artifactHash,
        submitTxHash: run.submitTxHash,
        resultJson: run.txSummary,
        jobId: `SUB-${run.submissionId}`,
      }));
      setLiveStatus("Awaiting verification…");
    } catch (e: any) {
      const raw = e?.message ?? "Run failed";
      const parsed = parseMaybeJson(raw);
      setError(parsed?.message ?? raw);
      pushTrace("Run failed", "error", parsed ?? { message: raw });
      setState((prev) => ({ ...prev, status: "started" }));
      setLiveStatus("");
    }
  };

  const handleVerify = async () => {
    setError("");
    setVerifyDebug(null);
    setLiveStatus("Verifying claim…");
    pushTrace("Verifying claim…", "info", {
      bountyId,
      submissionId: state.submissionId,
      artifactHash: state.artifactHash,
    });

    if (!state.submissionId || !state.artifactHash) {
      setError("Missing submissionId/artifactHash (run step didn’t complete).");
      pushTrace("Verify blocked: missing submissionId/artifactHash", "error");
      setLiveStatus("");
      return;
    }

    try {
      const verified = await postJson<{
        requestId: string;
        x402: any;
        verifyDigest: `0x${string}`;
        signature: `0x${string}`;
        claimTxHash: `0x${string}`;
        jobId?: string;
        jobTxHash?: `0x${string}` | null;
        jobError?: string | null;
      }>("/api/agent/verify-claim", {
        bountyId,
        submissionId: state.submissionId,
        artifactHash: state.artifactHash,
      });

      setVerifyDebug(verified);
      pushTrace("x402 verified", "success", { requestId: verified.requestId, verifyDigest: verified.verifyDigest });
      pushTrace("Signature produced", "success", { signature: verified.signature });
      pushTrace("Claim tx submitted", "success", { claimTxHash: verified.claimTxHash });
      pushTrace("x402 payload", "info", verified.x402);

      setState((prev) => ({
        ...prev,
        status: "completed",
        signature: verified.signature,
        claimTxHash: verified.claimTxHash,
        jobId: verified.jobId ?? prev.jobId,
      }));
      setLiveStatus("");
      if (onComplete) onComplete();
    } catch (e: any) {
      const raw = e?.message ?? "Verify failed";
      const parsed = parseMaybeJson(raw);

      setError(parsed?.message ?? raw);
      pushTrace("Verify failed", "error", parsed ?? { message: raw });
      setLiveStatus("");
    }
  };

  const renderStepIcon = (stepStatus: string, currentStatus: string) => {
    const order = ["idle", "started", "running", "verifying", "completed"];
    const stepIdx = order.indexOf(stepStatus);
    const currentIdx = order.indexOf(currentStatus);

    if (currentIdx > stepIdx) return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
    if (currentIdx === stepIdx && stepStatus !== "idle" && stepStatus !== "completed")
      return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
    return <Circle className="w-5 h-5 text-muted-foreground/30" />;
  };

  return (
    <Card className={cn("overflow-hidden border border-white/[0.08]", inline ? "bg-black/40 backdrop-blur-md" : "bg-[#0E1116]")}>
      <div className="px-6 py-4 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <div className="p-1.5 rounded bg-primary/10 text-primary">
            <TerminalSquare className="w-4 h-4" />
          </div>
          {txUrl(state.claimTxHash ?? state.submitTxHash) ? (
            <Link href={txUrl(state.claimTxHash ?? state.submitTxHash)!} target="_blank" className="hover:underline">
              <h3 className="font-mono text-sm font-bold text-foreground tracking-tight">Active Protocol Session</h3>
            </Link>
          ) : (
            <h3 className="font-mono text-sm font-bold text-foreground tracking-tight">Active Protocol Session</h3>
          )}
        </div>
        {state.jobId && (
          <Badge variant="neutral" className="font-mono text-[10px] bg-white/5">
            {state.jobId}
          </Badge>
        )}
      </div>

      <div className="p-6 space-y-8">
        <div
          className={cn(
            "relative pl-10 border-l transition-colors duration-500",
            state.status !== "idle" ? "border-primary/20" : "border-white/5",
          )}
        >
          <div className="absolute -left-[11px] top-0 bg-background rounded-full p-0.5">
            {renderStepIcon("idle", state.status)}
          </div>
          <h4
            className={cn(
              "text-sm font-medium mb-1 transition-colors",
              state.status === "idle" ? "text-foreground" : "text-muted-foreground",
            )}
          >
            1. Initialize Bounty Escrow
          </h4>

          <motion.div layout>
            {state.status === "idle" && (
              <div className="mt-3 space-y-2">
                <p className="text-xs text-muted-foreground">
                  {recommended
                    ? `Auto-selected open bounty #${recommended}.`
                    : "Select a bounty id to submit into, or create a new one."}
                </p>

                <Input
                  value={String(bountyId)}
                  onChange={(e) => setBountyId(Number(e.target.value || 1))}
                  className="bg-black/20"
                  placeholder="Bounty Id (e.g. 3)"
                />

                <div className="flex flex-wrap gap-2">
                  <Button onClick={handleStartJob} className="w-full sm:w-auto" variant="glass">
                    Continue
                  </Button>
                  <Button
                    onClick={() => setCreateOpen((v) => !v)}
                    className="w-full sm:w-auto"
                    variant="secondary"
                    type="button"
                  >
                    {createOpen ? "Close" : "Create new bounty"}
                  </Button>
                </div>

                {createOpen && (
                  <div className="mt-3 p-3 rounded-xl border border-white/5 bg-white/[0.02] space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input
                        value={rewardUSDC}
                        onChange={(e) => setRewardUSDC(e.target.value)}
                        className="bg-black/20"
                        placeholder="Reward (USDC) e.g. 0.01"
                      />
                      <Input
                        value={deadlineDays}
                        onChange={(e) => setDeadlineDays(e.target.value)}
                        className="bg-black/20"
                        placeholder="Deadline (days) e.g. 7"
                      />
                      <Input
                        value={specText}
                        onChange={(e) => setSpecText(e.target.value)}
                        className="bg-black/20"
                        placeholder="Spec text (hashed)"
                      />
                    </div>

                    {createErr && (
                      <div className="text-xs text-red-400 border border-red-500/20 bg-red-500/5 px-3 py-2 rounded-lg">
                        {createErr}
                      </div>
                    )}

                    <Button
                      onClick={() => void handleCreateBounty()}
                      disabled={!walletClient || createBusy}
                      className="w-full sm:w-auto"
                      variant="default"
                      type="button"
                    >
                      {createBusy ? "Creating..." : "Create on-chain (approve + create)"}
                    </Button>

                    <p className="text-[10px] text-muted-foreground">
                      Uses: MetaMask → (USDC approve if needed) → createBountyWithValidator.
                    </p>
                  </div>
                )}
              </div>
            )}
            {state.status !== "idle" && (
              <div className="text-[10px] font-mono text-primary/80 bg-primary/5 px-2 py-1 rounded inline-block mt-1">
                Bounty: {state.bountyId ?? "N/A"}
              </div>
            )}
          </motion.div>
        </div>

        <div
          className={cn(
            "relative pl-10 border-l transition-colors duration-500",
            ["running", "verifying", "completed"].includes(state.status) ? "border-primary/20" : "border-white/5",
          )}
        >
          <div className="absolute -left-[11px] top-0 bg-background rounded-full p-0.5">
            {renderStepIcon("started", state.status)}
          </div>
          <h4
            className={cn(
              "text-sm font-medium mb-1 transition-colors",
              state.status === "started" ? "text-foreground" : "text-muted-foreground",
            )}
          >
            2. Provide Input & Execute
          </h4>

          <motion.div layout>
            {state.status === "started" && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3">
                <div className="flex gap-2">
                  <Input
                    placeholder={agentId === "tx-explainer" ? "0x... Transaction Hash" : "0x... Wallet Address"}
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    className="bg-black/20"
                  />
                  <Button onClick={handleRunAgent} disabled={!inputValue} variant="default">
                    <Play className="w-3.5 h-3.5 mr-2" /> Run
                  </Button>
                </div>
              </motion.div>
            )}

            {["running", "verifying", "completed"].includes(state.status) && (
              <div className="space-y-2 mt-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <span className="font-mono bg-white/5 px-2 py-0.5 rounded text-[10px]">{truncateHash(inputValue)}</span>
                </div>
                {state.submitTxHash && (
                  <Link
                    href={txUrl(state.submitTxHash)!}
                    target="_blank"
                    className="text-[10px] font-mono text-primary/80 hover:underline"
                  >
                    View submit tx ↗
                  </Link>
                )}
                {state.artifactHash && (
                  <Link
                    href={`/api/artifacts/${state.artifactHash}`}
                    target="_blank"
                    className="text-[10px] font-mono text-muted-foreground hover:underline"
                  >
                    View artifact JSON ↗
                  </Link>
                )}
                {state.resultJson && (
                  <div className="bg-[#0A0C10] rounded-lg p-4 border border-white/5 font-mono text-xs text-emerald-400/90 overflow-x-auto shadow-inner">
                    <pre>{JSON.stringify(state.resultJson, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>

        {error && (
          <div className="text-xs text-red-400 border border-red-500/20 bg-red-500/5 px-3 py-2 rounded-lg">
            {error}
          </div>
        )}

        <div className={cn("relative pl-10 border-l border-transparent")}>
          <div className="absolute -left-[11px] top-0 bg-background rounded-full p-0.5">
            {renderStepIcon("verifying", state.status)}
          </div>
          <h4
            className={cn(
              "text-sm font-medium mb-1 transition-colors",
              state.status === "verifying" ? "text-foreground" : "text-muted-foreground",
            )}
          >
            3. Verification & Settlement
          </h4>

          <motion.div layout>
            {state.status === "verifying" && (
              <Button onClick={handleVerify} variant="default" className="w-full sm:w-auto mt-3">
                Verify Proof & Claim
              </Button>
            )}

            {state.status === "completed" && (
              <div className="space-y-4 mt-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="success" className="gap-1.5 py-1 px-2.5">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Verified
                  </Badge>
                  {state.claimTxHash ? (
                    <Link href={txUrl(state.claimTxHash)!} target="_blank">
                      <Badge variant="neutral" className="font-mono text-[10px] hover:underline">
                        Proof/Claim tx: {state.claimTxHash.slice(0, 10)}...
                      </Badge>
                    </Link>
                  ) : (
                    <Badge variant="neutral" className="font-mono text-[10px]">
                      Proof: {state.signature?.slice(0, 10)}...
                    </Badge>
                  )}
                </div>

                {!state.feedbackSubmitted ? (
                  <div className="pt-4 border-t border-white/5">
                    <p className="text-xs text-muted-foreground mb-3">Rate the agent output to build on-chain reputation.</p>
                    <div className="flex gap-2">
                      <Input
                        placeholder="Comment (optional)"
                        className="h-9 text-xs bg-white/5"
                        value={feedback}
                        onChange={(e) => setFeedback(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => setState((prev) => ({ ...prev, feedbackSubmitted: true }))}
                      >
                        Submit
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-muted-foreground flex items-center gap-2 mt-2">
                    <CheckCircle2 className="w-3 h-3 text-secondary" /> Feedback saved (UI only).
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>
      <Card className="border border-white/[0.08] bg-white/[0.02]">
        <div className="px-4 py-3 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary" />
            <div className="text-sm font-medium">Protocol Trace</div>
            {liveStatus && (
              <span className="text-[10px] font-mono text-muted-foreground bg-white/5 px-2 py-1 rounded">
                {liveStatus}
              </span>
            )}
          </div>

          <Button variant="glass" size="sm" onClick={() => setTraceOpen((v) => !v)}>
            {traceOpen ? "Hide" : "Show"}
          </Button>
        </div>

        {traceOpen && (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {runDebug?.requestId && (
                <div className="bg-black/20 border border-white/5 rounded-lg p-3">
                  <div className="text-muted-foreground text-[10px] mb-1">run.requestId</div>
                  <div className="font-mono break-all">{runDebug.requestId}</div>
                </div>
              )}
              {runDebug?.sessionId && (
                <div className="bg-black/20 border border-white/5 rounded-lg p-3">
                  <div className="text-muted-foreground text-[10px] mb-1">agent session</div>
                  <div className="font-mono break-all">{runDebug.sessionId}</div>
                </div>
              )}
              {verifyDebug?.verifyDigest && (
                <div className="bg-black/20 border border-white/5 rounded-lg p-3">
                  <div className="text-muted-foreground text-[10px] mb-1">verifyDigest</div>
                  <div className="font-mono break-all">{verifyDebug.verifyDigest}</div>
                </div>
              )}
              {verifyDebug?.claimTxHash && txUrl(verifyDebug.claimTxHash) && (
                <div className="bg-black/20 border border-white/5 rounded-lg p-3">
                  <div className="text-muted-foreground text-[10px] mb-1">claimTx</div>
                  <Link href={txUrl(verifyDebug.claimTxHash)!} target="_blank" className="font-mono break-all hover:underline">
                    {verifyDebug.claimTxHash}
                  </Link>
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs text-muted-foreground">Timeline</div>
              <div className="space-y-2">
                {trace.length === 0 ? (
                  <div className="text-xs text-muted-foreground">No trace yet. Run an agent to populate this.</div>
                ) : (
                  trace.slice(-12).map((e, idx) => (
                    <div
                      key={`${e.ts}-${idx}`}
                      className="flex items-start gap-3 rounded-lg border border-white/5 bg-black/20 px-3 py-2"
                    >
                      <div
                        className={cn(
                          "mt-1 w-2 h-2 rounded-full",
                          e.level === "success" ? "bg-emerald-500" : e.level === "error" ? "bg-red-500" : "bg-primary",
                        )}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs font-medium">{e.title}</div>
                          <div className="text-[10px] font-mono text-muted-foreground">
                            {new Date(e.ts).toLocaleTimeString()}
                          </div>
                        </div>
                        {e.data !== undefined && (
                          <pre className="mt-2 text-[10px] text-muted-foreground overflow-x-auto whitespace-pre-wrap break-words">
                            {JSON.stringify(e.data, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {verifyDebug?.x402 && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">x402</div>
                <pre className="text-[10px] bg-black/30 border border-white/5 rounded-lg p-3 overflow-x-auto">
                  {JSON.stringify(verifyDebug.x402, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Card>
    </Card>
  );
};
