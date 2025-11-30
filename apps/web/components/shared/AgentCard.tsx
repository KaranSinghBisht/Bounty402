// /web/components/shared/AgentCard.tsx
"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, Cpu, FileSearch, Shield, Star, Wallet } from "lucide-react";
import type { Agent } from "@/types";
import { Badge, Card } from "@/components/ui/Primitives";

const IconMap = {
  FileSearch,
  Wallet,
  Shield,
  Cpu,
};

export const AgentCard = ({ agent }: { agent: Agent }) => {
  const Icon = IconMap[agent.iconName];

  return (
    <Link href={`/agents/${agent.id}`} className="block h-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        whileHover={{ y: -4 }}
        transition={{ duration: 0.3 }}
        className="h-full"
      >
        <Card className="h-full p-6 flex flex-col transition-all duration-300 hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5 group relative overflow-hidden bg-[#0F1219]">
          <div className="flex justify-between items-start mb-5 relative z-10">
            <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] group-hover:bg-primary/10 group-hover:text-primary transition-colors">
              <Icon className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <Badge variant="neutral" className="font-mono text-[10px] uppercase tracking-wider">
              {agent.category}
            </Badge>
          </div>

          <h3 className="text-lg font-semibold mb-2 group-hover:text-primary transition-colors">{agent.name}</h3>
          <p className="text-sm text-muted-foreground mb-6 flex-grow leading-relaxed">{agent.description}</p>

          <div className="flex flex-wrap gap-2 mb-6">
            {agent.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-2 py-1 rounded-md bg-white/[0.02] text-muted-foreground border border-white/[0.05]"
              >
                #{tag}
              </span>
            ))}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-white/[0.06] mt-auto">
            <div className="flex items-center gap-1.5 font-medium font-mono">
              <span className="text-base text-white">${agent.price}</span>
              <span className="text-xs text-muted-foreground">USDC</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground/80">
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" /> {agent.runCount > 1000 ? `${(agent.runCount / 1000).toFixed(1)}k` : agent.runCount}
              </span>
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-secondary fill-secondary/20" /> {agent.rating}
              </span>
            </div>
          </div>
        </Card>
      </motion.div>
    </Link>
  );
};
