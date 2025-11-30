// /web/app/agents/[address]/page.tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, ArrowLeft, CheckCircle, ShieldCheck, Zap } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { JobFlow } from "@/components/features/JobFlow";
import { Badge, Card, buttonClasses } from "@/components/ui/Primitives";
import { AGENTS } from "@/data/agents";
import { cn } from "@/lib/ui-utils";

export default function AgentDetailPage({ params }: { params: { address: string } }) {
  const agent = AGENTS.find((a) => a.id === params.address);

  if (!agent) {
    return (
      <AppShell>
        <div className="p-10 text-center">Agent not found</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-8 pb-20">
        <Link
          href="/marketplace"
          className={cn(buttonClasses("ghost", "sm"), "-ml-4 mb-2 text-muted-foreground hover:text-foreground inline-flex gap-2")}
        >
          <ArrowLeft className="w-4 h-4" /> Back to Marketplace
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-10">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <div className="flex items-center gap-3 mb-6">
                <Badge variant="neutral" className="bg-white/5">
                  {agent.category}
                </Badge>
                <span className="text-xs text-muted-foreground/60 font-mono uppercase tracking-widest">ID: {agent.id}</span>
              </div>
              <h1 className="text-5xl font-bold mb-6 tracking-tight text-white">{agent.name}</h1>
              <p className="text-lg text-muted-foreground leading-relaxed max-w-2xl">
                {agent.fullDescription || agent.description}
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="p-5 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-emerald-400">
                  <ShieldCheck className="w-5 h-5" />
                  <span className="font-bold text-sm">Verified Logic</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Source code matches IPFS hash <span className="text-foreground/70 font-mono">QmX7...9v2</span>.
                </p>
              </Card>
              <Card className="p-5 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-blue-400">
                  <Activity className="w-5 h-5" />
                  <span className="font-bold text-sm">TEE Enclave</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Execution occurs in a secure enclave. Input data is invisible to the node operator.
                </p>
              </Card>
            </div>

            <div>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold">Protocol Interface</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  System Online
                </div>
              </div>
              <JobFlow agentId={agent.id} />
            </div>
          </div>

          <div className="space-y-6">
            <Card className="p-6 border-primary/20 bg-[#0F1219] shadow-2xl shadow-black/50">
              <div className="mb-6 pb-6 border-b border-white/5">
                <span className="text-sm text-muted-foreground block mb-2">Cost estimation</span>
                <div className="flex items-baseline gap-2">
                  <span className="text-4xl font-mono font-bold text-white">${agent.price}</span>
                  <span className="text-sm text-muted-foreground">USDC / run</span>
                </div>
              </div>
              <div className="space-y-4">
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Activity className="w-4 h-4" /> Global Usage
                  </span>
                  <span className="font-mono text-white font-medium">{agent.runCount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <Zap className="w-4 h-4" /> Latency
                  </span>
                  <span className="font-mono text-white font-medium">~1.2s</span>
                </div>
                <div className="flex justify-between text-sm items-center">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Success Rate
                  </span>
                  <span className="font-mono text-emerald-400 font-medium">99.8%</span>
                </div>
              </div>
            </Card>

            <div className="space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Capabilities</h4>
              {["Analyzes Transaction Logs", "Decodes Input Data", "Privacy Preserving", "Instant Settlement"].map((cap) => (
                <div key={cap} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle className="w-3.5 h-3.5 text-primary/70" /> {cap}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
