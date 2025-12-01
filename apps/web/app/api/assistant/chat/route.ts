import crypto from "node:crypto";
import { z } from "zod";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { jsonError } from "@/lib/apiError";

export const runtime = "nodejs";

const Body = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().min(1),
      }),
    )
    .min(1),
});

function extractTxHash(s: string) {
  return s.match(/0x[a-fA-F0-9]{64}/)?.[0] ?? null;
}
function extractAddress(s: string) {
  return s.match(/0x[a-fA-F0-9]{40}/)?.[0] ?? null;
}

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("INVALID_BODY", "Invalid request body", 400, parsed.error.flatten(), requestId);
  }

  const allText = parsed.data.messages.map((m) => m.content).join("\n");
  const lastUser = [...parsed.data.messages].reverse().find((m) => m.role === "user")?.content ?? "";

  const tx = extractTxHash(allText);
  const addr = tx ? null : extractAddress(allText);

  const mentionsTx = /\b(tx|transaction|hash|decode)\b/i.test(lastUser);
  const mentionsWallet = /\b(wallet|address|profile)\b/i.test(lastUser);

  let action: { type: "OPEN_AGENT"; agentId: "tx-explainer" | "wallet-explainer"; input?: string } | null = null;

  if (tx) action = { type: "OPEN_AGENT", agentId: "tx-explainer", input: tx };
  else if (addr) action = { type: "OPEN_AGENT", agentId: "wallet-explainer", input: addr };
  else if (mentionsTx) action = { type: "OPEN_AGENT", agentId: "tx-explainer" };
  else if (mentionsWallet) action = { type: "OPEN_AGENT", agentId: "wallet-explainer" };

  const apiKey = process.env.GOOGLE_GENERATIVE_AI_API_KEY || process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return jsonError("MISSING_ENV", "Missing GOOGLE_GENERATIVE_AI_API_KEY (or GEMINI_API_KEY)", 500, undefined, requestId);
  }

  const google = createGoogleGenerativeAI({ apiKey });
  const model = google.languageModel(process.env.GEMINI_MODEL_ID || "gemini-2.0-flash");

  const SYSTEM = `
You are the Bounty402 chat assistant.
Keep answers short + demo-friendly.
If a tx hash is provided, ask to run tx-explainer.
If an address is provided, ask to run wallet-explainer.
Otherwise ask one short question.
`;

  const { text } = await generateText({
    model,
    system: SYSTEM,
    messages: parsed.data.messages.map((m) => ({ role: m.role, content: m.content })),
    maxOutputTokens: 400,
  });

  return Response.json({
    requestId,
    message: { role: "assistant", content: text },
    action,
  });
}
