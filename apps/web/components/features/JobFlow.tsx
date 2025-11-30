// /web/components/features/JobFlow.tsx
"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle2, Circle, Loader2, Play, TerminalSquare } from "lucide-react";
import type { JobState } from "@/types";
import { cn, delay, truncateHash } from "@/lib/ui-utils";
import { Badge, Button, Card, Input } from "@/components/ui/Primitives";

interface JobFlowProps {
  agentId: string;
  onComplete?: () => void;
  inline?: boolean;
}

export const JobFlow = ({ agentId, onComplete, inline = false }: JobFlowProps) => {
  const [state, setState] = useState<JobState>({
    agentId,
    status: "idle",
  });
  const [inputValue, setInputValue] = useState("");
  const [feedback, setFeedback] = useState("");

  const handleStartJob = async () => {
    setState((prev) => ({ ...prev, status: "started" }));
    await delay(1500);
    setState((prev) => ({
      ...prev,
      bountyId: "402-8821",
      createTxHash: "0x7a39...2b91",
      jobId: `JOB-${Math.floor(Math.random() * 10000)}`,
    }));
  };

  const handleRunAgent = async () => {
    if (!inputValue) return;
    setState((prev) => ({ ...prev, status: "running" }));
    await delay(3000);
    setState((prev) => ({
      ...prev,
      status: "verifying",
      submissionId: 402,
      artifactHash: "QmHash...Target",
      submitTxHash: "0x8b12...9c22",
      resultJson: {
        analysis: "High Probability of success",
        riskScore: 12,
        entities: ["Uniswap V3", "USDC Contract"],
        timestamp: new Date().toISOString(),
      },
    }));
  };

  const handleVerify = async () => {
    await delay(1500);
    setState((prev) => ({
      ...prev,
      status: "completed",
      signature: "0xSig...Verified",
      claimTxHash: "0x9c33...1d44",
    }));
    if (onComplete) onComplete();
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
          <h3 className="font-mono text-sm font-bold text-foreground tracking-tight">Active Protocol Session</h3>
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
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-3">Deposit funds into the smart contract escrow to begin.</p>
                <Button onClick={handleStartJob} className="w-full sm:w-auto" variant="glass">
                  Deposit 0.01 USDC
                </Button>
              </div>
            )}
            {state.status !== "idle" && (
              <div className="text-[10px] font-mono text-primary/80 bg-primary/5 px-2 py-1 rounded inline-block mt-1">
                Tx: {state.createTxHash}
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
                {state.resultJson && (
                  <div className="bg-[#0A0C10] rounded-lg p-4 border border-white/5 font-mono text-xs text-emerald-400/90 overflow-x-auto shadow-inner">
                    <pre>{JSON.stringify(state.resultJson, null, 2)}</pre>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>

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
                  <Badge variant="neutral" className="font-mono text-[10px]">
                    Proof: {state.signature?.slice(0, 10)}...
                  </Badge>
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
                    <CheckCircle2 className="w-3 h-3 text-secondary" /> Feedback recorded on-chain.
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </div>
      </div>
    </Card>
  );
};
