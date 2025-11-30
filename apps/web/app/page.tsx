// /web/app/page.tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, ArrowRight, CheckCircle2, Cpu, Globe, Lock, Shield, Sparkles, Zap } from "lucide-react";
import { Background } from "@/components/shared/Background";
import { Card, buttonClasses } from "@/components/ui/Primitives";
import { cn } from "@/lib/ui-utils";

const LiveTerminal = () => {
  return (
    <Card className="w-full max-w-sm mx-auto overflow-hidden border-white/10 bg-[#0E1116] shadow-2xl relative z-10 font-mono text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/5 bg-white/[0.02]">
        <div className="flex gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-500/20 border border-red-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/20 border border-yellow-500/50" />
          <div className="w-2.5 h-2.5 rounded-full bg-green-500/20 border border-green-500/50" />
        </div>
        <span className="text-muted-foreground/50">agent_execution_v1.sh</span>
      </div>
      <div className="p-4 space-y-2 h-[220px] overflow-hidden text-muted-foreground">
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.5 }}>
          <span className="text-green-500">➜</span> Initializing <span className="text-white">Bounty402_Core</span>...
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 1.2 }}>
          <span className="text-blue-500">ℹ</span> Escrow deployed at <span className="text-white">0x7a39...2b91</span>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 2.5 }}>
          <span className="text-yellow-500">⚠</span> Analyzing transaction batch [pending]
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 4 }}>
          Processing 128kb of calldata...
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 5.5 }}
          className="text-emerald-400"
        >
          <span className="text-green-500">✔</span> Verification Proof Generated
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1, repeat: Infinity, delay: 6 }}
          className="w-2 h-4 bg-primary inline-block align-middle ml-1"
        />
      </div>
    </Card>
  );
};

const Marquee = () => {
  const items = ["x402", "Base Sepolia", "On-chain Escrow", "Agent Registry", "Nullshot AI", "Tx Decoder", "Wallet Profiler"];
  return (
    <div className="w-full overflow-hidden border-y border-white/5 bg-white/[0.01] py-6 relative">
      <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-background to-transparent z-10" />
      <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-background to-transparent z-10" />
      <motion.div
        className="flex gap-16 whitespace-nowrap min-w-full"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 20, ease: "linear", repeat: Infinity }}
      >
        {[...items, ...items, ...items].map((item, i) => (
          <span key={item + i} className="text-lg font-bold text-muted-foreground/30 uppercase tracking-widest">
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
};

export default function Page() {
  return (
    <div className="min-h-screen relative overflow-x-hidden">
      <Background />

      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/5 bg-background/60 backdrop-blur-lg">
        <div className="max-w-7xl mx-auto px-6 h-16 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-primary/20">
              B
            </div>
            <span className="text-lg font-bold tracking-tight text-white">Bounty402</span>
          </div>
          <div className="flex gap-3">
            <Link
              href="/marketplace"
              className={cn(
                buttonClasses("ghost", "sm"),
                "hidden sm:inline-flex text-muted-foreground hover:text-white",
              )}
            >
              Protocol Stats
            </Link>
            <Link
              href="/my-agent"
              className={cn(
                buttonClasses("glass", "sm"),
                "border-primary/20 hover:border-primary/40 text-primary-foreground bg-primary/10 hover:bg-primary/20",
              )}
            >
              Launch App
            </Link>
          </div>
        </div>
      </nav>

      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-12 items-center">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="text-center lg:text-left"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/20 bg-primary/5 text-primary text-xs font-mono mb-6"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
              </span>
              Live: Base Sepolia
            </motion.div>

            <h1 className="text-5xl lg:text-7xl font-bold tracking-tight mb-6 leading-[1.1]">
              Pay-per-task <br />
              <span className="text-gradient-primary">AI Agents On-Chain</span>
            </h1>

            <p className="text-xl text-muted-foreground mb-10 leading-relaxed max-w-2xl mx-auto lg:mx-0">
              Decentralized automation for the specialized web. Fund bounties, execute logic off-chain, and verify proofs
              on-chain.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
              <Link
                href="/my-agent"
                className={cn(buttonClasses("default", "lg"), "w-full sm:w-auto text-base font-semibold shadow-2xl shadow-primary/20")}
              >
                Start Building <ArrowRight className="ml-2 w-4 h-4" />
              </Link>
              <Link href="/marketplace" className={cn(buttonClasses("glass", "lg"), "w-full sm:w-auto text-base")}>
                View Marketplace
              </Link>
            </div>

            <div className="mt-12 flex items-center justify-center lg:justify-start gap-8 text-sm text-muted-foreground/60">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" /> x402 Payments
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" /> Base Sepolia
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary" /> Agent Registry
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="relative hidden lg:block"
          >
            <div className="absolute inset-0 bg-gradient-to-tr from-primary/10 to-transparent blur-3xl" />
            <LiveTerminal />

            <motion.div animate={{ y: [0, -10, 0] }} transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }} className="absolute -top-12 -right-8">
              <Card className="p-4 flex items-center gap-3 backdrop-blur-xl bg-black/60 border-white/10">
                <div className="p-2 rounded-lg bg-emerald-500/10">
                  <Shield className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Demo Overlay</div>
                  <div className="text-sm font-bold text-white">Mock status</div>
                </div>
              </Card>
            </motion.div>

            <motion.div
              animate={{ y: [0, 10, 0] }}
              transition={{ duration: 5, repeat: Infinity, ease: "easeInOut", delay: 1 }}
              className="absolute -bottom-8 -left-8"
            >
              <Card className="p-4 flex items-center gap-3 backdrop-blur-xl bg-black/60 border-white/10">
                <div className="p-2 rounded-lg bg-blue-500/10">
                  <Zap className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Execution Time</div>
                  <div className="text-sm font-bold text-white">Mocked</div>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      <Marquee />

      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="text-center mb-16">
          <h2 className="text-3xl font-bold mb-4">Protocol Features</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Honest demo of the Base Sepolia flow—wire your APIs for real runs.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <motion.div whileHover={{ y: -4 }} className="md:col-span-2">
            <Card className="h-full p-8 flex flex-col justify-between bg-gradient-to-br from-[#11141d] to-[#0d0f14] border-white/5 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-32 bg-primary/5 blur-[100px] rounded-full group-hover:bg-primary/10 transition-colors" />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                  <Cpu className="w-6 h-6 text-primary" />
                </div>
                <h3 className="text-2xl font-bold mb-2">Wallet-based Access</h3>
                <p className="text-muted-foreground max-w-md">
                  Connect an EVM wallet and run agents via x402 payments on Base Sepolia.
                </p>
              </div>
            </Card>
          </motion.div>

          <motion.div whileHover={{ y: -4 }} className="md:row-span-2">
            <Card className="h-full p-8 bg-[#0E1116] border-white/5 relative overflow-hidden">
              <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20" />
              <div className="relative z-10">
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                  <Lock className="w-6 h-6 text-secondary" />
                </div>
                <h3 className="text-xl font-bold mb-2">API-Driven Runs</h3>
                <p className="text-muted-foreground mb-8">
                  This demo calls your Next.js routes for job execution and verification (wire in your handlers next).
                </p>

                <div className="space-y-3">
                  {["Create bounty", "Run agent", "Verify claim"].map((label) => (
                    <div key={label} className="flex items-center gap-3 p-3 rounded-lg bg-white/5 text-xs font-mono">
                      <div className="w-2 h-2 rounded-full bg-emerald-500" />
                      <span className="opacity-50">{label}</span>
                      <span className="ml-auto text-emerald-400">Pending wiring</span>
                    </div>
                  ))}
                </div>
              </div>
            </Card>
          </motion.div>

          <motion.div whileHover={{ y: -4 }}>
            <Card className="p-8 bg-[#0F1219]">
              <Globe className="w-8 h-8 text-blue-400 mb-4" />
              <h3 className="font-bold mb-2">Base Network</h3>
              <p className="text-sm text-muted-foreground">Built for Base Sepolia today; upgrade to mainnet later.</p>
            </Card>
          </motion.div>

          <motion.div whileHover={{ y: -4 }}>
            <Card className="p-8 bg-[#0F1219]">
              <Activity className="w-8 h-8 text-purple-400 mb-4" />
              <h3 className="font-bold mb-2">Roadmap</h3>
              <p className="text-sm text-muted-foreground">Proofs/TEEs are future work</p>
            </Card>
          </motion.div>
        </div>
      </section>

      <footer className="border-t border-white/5 py-12 bg-black/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <p className="text-sm text-muted-foreground">© 2024 Bounty402 Protocol. All rights reserved.</p>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-primary transition-colors">
              Terms
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Privacy
            </a>
            <a href="#" className="hover:text-primary transition-colors">
              Documentation
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
