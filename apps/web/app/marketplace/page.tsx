// /web/app/marketplace/page.tsx
"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Filter, Search, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { AgentCard } from "@/components/shared/AgentCard";
import { Input } from "@/components/ui/Primitives";
import { AGENTS } from "@/data/agents";
import { AgentCategory } from "@/types";

const CATEGORIES: AgentCategory[] = ["Transactions", "Wallet"];

export default function MarketplacePage() {
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<AgentCategory | "All">("All");

  const filteredAgents = AGENTS.filter((agent) => {
    const matchesSearch =
      agent.name.toLowerCase().includes(search.toLowerCase()) ||
      agent.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = selectedCategory === "All" || agent.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <AppShell>
      <div className="space-y-10">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border border-primary/10 p-8">
          <div className="relative z-10">
            <div className="flex items-center gap-2 mb-3 text-primary">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs font-bold tracking-widest uppercase">Featured Collection</span>
            </div>
            <h2 className="text-3xl font-bold mb-2">Agent Duo</h2>
            <p className="text-muted-foreground max-w-xl">
              Try the Tx Decoder 402 or Wallet Profiler to demo the Base Sepolia payments + registry flow.
            </p>
          </div>
          <div className="absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-primary/10 to-transparent skew-x-12 opacity-50" />
        </div>

        <div className="flex flex-col md:flex-row gap-6 justify-between items-end md:items-center">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-1">Explore Agents</h1>
            <p className="text-sm text-muted-foreground">Discover verified logic modules.</p>
          </div>

          <div className="w-full md:w-auto flex flex-col md:flex-row gap-4">
            <div className="relative group">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
              <Input
                placeholder="Search by name or capability..."
                className="pl-9 w-full md:w-[320px] bg-white/[0.03] border-white/[0.08] focus:bg-background transition-all"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide border-b border-white/5">
          <button
            onClick={() => setSelectedCategory("All")}
            className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all border-b-2 ${
              selectedCategory === "All"
                ? "border-primary text-primary bg-primary/5"
                : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5"
            }`}
          >
            All Agents
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-t-lg text-sm font-medium transition-all whitespace-nowrap border-b-2 ${
                selectedCategory === cat
                  ? "border-primary text-primary bg-primary/5"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </div>

        {filteredAgents.length === 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="h-64 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-white/10 rounded-2xl bg-white/[0.01]"
          >
            <div className="p-4 rounded-full bg-white/5 mb-4">
              <Filter className="w-8 h-8 opacity-50" />
            </div>
            <p className="font-medium">No agents found</p>
            <p className="text-sm opacity-50">Try adjusting your search or filters</p>
          </motion.div>
        )}
      </div>
    </AppShell>
  );
}
