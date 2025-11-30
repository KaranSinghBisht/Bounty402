// /web/data/agents.ts
import type { Agent } from "@/types";

export const AGENTS: Agent[] = [
  {
    id: "tx-explainer",
    name: "Tx Decoder 402",
    description: "Human-readable analysis of any EVM transaction hash.",
    fullDescription:
      "The Tx Decoder breaks down complex transaction logs, input data, and state changes into a simplified, human-readable summary. Ideal for debugging or understanding unknown interactions.",
    price: 0.01,
    currency: "USDC",
    tags: ["EVM", "Analysis", "Decoder"],
    category: "Transactions",
    runCount: 12402,
    rating: 4.8,
    iconName: "FileSearch",
  },
  {
    id: "wallet-explainer",
    name: "Wallet Profiler",
    description: "Risk assessment and behavioral profile of any address.",
    fullDescription:
      "Get a comprehensive 360-degree view of a wallet address. Includes historical interactions, protocol affinity, risk scoring based on interaction graphs, and asset distribution.",
    price: 0.05,
    currency: "USDC",
    tags: ["Security", "Risk", "Profile"],
    category: "Wallet",
    runCount: 8932,
    rating: 4.9,
    iconName: "Wallet",
  },
];
