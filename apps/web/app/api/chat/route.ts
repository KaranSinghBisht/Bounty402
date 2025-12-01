// /web/app/api/chat/route.ts
import crypto from "node:crypto";
import { z } from "zod";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/apiError";

export const runtime = "nodejs";

const Body = z.object({
  agentType: z.enum(["tx-explainer", "wallet-explainer"]).default("tx-explainer"),
  sessionId: z.string().min(1),
  messages: z.array(z.object({ role: z.string(), content: z.string() })).min(1),
});

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return jsonError("INVALID_BODY", "Invalid request body", 400, parsed.error.flatten(), requestId);

  const txUrl = process.env.TX_EXPLAINER_URL || "https://tx-explainer.karanbishttt.workers.dev";
  const walletUrl =
    process.env.WALLET_AGENT_URL || process.env.WALLET_EXPLAINER_URL || "https://wallet-agent.karanbishttt.workers.dev";

  const base = parsed.data.agentType === "wallet-explainer" ? walletUrl : txUrl;

  const r = await fetch(`${base}/agent/chat/${parsed.data.sessionId}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-request-id": requestId },
    body: JSON.stringify({ messages: parsed.data.messages }),
  });

  const text = await r.text().catch(() => "");
  if (!r.ok) return jsonError("CHAT_FAILED", "agent chat failed", 502, { status: r.status, body: text }, requestId);

  return new Response(text, { status: 200, headers: { "content-type": "application/json" } });
}
