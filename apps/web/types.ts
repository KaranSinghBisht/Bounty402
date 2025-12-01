// /web/types.ts
export type AgentCategory = "Transactions" | "Wallet" | "Security" | "DeFi";

export interface Agent {
  id: string;
  name: string;
  description: string;
  fullDescription?: string;
  price: number;
  currency: string;
  tags: string[];
  category: AgentCategory;
  runCount: number;
  rating: number;
  iconName: "FileSearch" | "Wallet" | "Shield" | "Cpu";
}

export type JobStatus = "idle" | "started" | "running" | "verifying" | "completed";

export interface JobState {
  agentId: string;
  status: JobStatus;
  bountyId?: string;
  createTxHash?: string;
  submissionId?: number;
  artifactHash?: string;
  submitTxHash?: string;
  signature?: string;
  claimTxHash?: string;
  jobId?: string;
  jobTxHash?: string;
  requestId?: string;
  resultJson?: any;
  feedbackSubmitted?: boolean;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  relatedAgentId?: string;
  relatedInput?: string;
  timestamp: number;
}
