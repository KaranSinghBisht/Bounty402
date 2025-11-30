import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { ToolboxService, AiSdkAgent, type AIUISDKMessage } from "@nullshot/agent";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { stepCountIs, type LanguageModel, type Provider, type ToolSet } from "ai";

import mcpConfig from "../mcp.json";
import { makeTxTools } from "./tools/tx";

const EnvSchema = z.object({
  AI_PROVIDER: z.literal("google"),
  AI_PROVIDER_API_KEY: z.string().min(1),
  MODEL_ID: z.string().min(1),
});

const SYSTEM_PROMPT = `
You are a transaction explainer for Base Sepolia.
When needed, use tools to fetch tx/receipt and decode.
- Prefer getTxSummary for a single structured view.
- Never invent data.
- Explain intent + risks (approvals, unlimited approvals, unknown contracts, reverted tx).
If the user asks for ONLY JSON tool result, return only raw JSON.
`.trim();

function tryParseToolCall(text: string): { name: string; args: unknown } | null {
  const m = text.match(/Call\s+([A-Za-z0-9_]+)\s+with\s+(\{[\s\S]*\})/i);
  if (!m) return null;
  try {
    return { name: m[1], args: JSON.parse(m[2]) };
  } catch {
    return null;
  }
}

const app = new Hono<{ Bindings: Env }>();
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["POST", "GET", "OPTIONS"],
    allowHeaders: ["Content-Type"],
    exposeHeaders: ["X-Session-Id"],
    maxAge: 86400,
  }),
);

app.get("/debug/tools", (c) => {
  const tools = makeTxTools(c.env);
  return c.json({ toolNames: Object.keys(tools) });
});

app.all("/agent/chat/:sessionId?", async (c) => {
  const { AGENT } = c.env;
  let sessionIdStr = c.req.param("sessionId");
  if (!sessionIdStr) sessionIdStr = crypto.randomUUID();
  const id = AGENT.idFromName(sessionIdStr);

  const forwardRequest = new Request(`https://internal/agent/chat/${sessionIdStr}`, {
    method: c.req.method,
    headers: c.req.raw.headers,
    body: c.req.raw.body,
  });

  return AGENT.get(id).fetch(forwardRequest);
});

export class SimplePromptAgent extends AiSdkAgent<Env> {
  private readonly runtimeEnv: Env;

  constructor(state: DurableObjectState, env: Env) {
    const validated = EnvSchema.parse(env);

    const provider: Provider = createGoogleGenerativeAI({
      apiKey: validated.AI_PROVIDER_API_KEY,
    });
    const model: LanguageModel = provider.languageModel(validated.MODEL_ID);

    const safeEnv = { ...env, AI_PROVIDER_API_KEY: "(hidden)" };
    super(state, env, model, [new ToolboxService(safeEnv as any, mcpConfig)]);
    this.runtimeEnv = env;
  }

  async processMessage(sessionId: string, messages: AIUISDKMessage): Promise<Response> {
    const tools = makeTxTools(this.runtimeEnv) as unknown as ToolSet;

    const last = messages.messages?.[messages.messages.length - 1];
    const userText =
      typeof last?.content === "string"
        ? last.content
        : Array.isArray(last?.content)
          ? last.content.map((c: any) => c.text ?? "").join(" ")
          : "";

    const jsonOnly = /only\s+the\s+json/i.test(userText);

    if (jsonOnly) {
      const parsed = tryParseToolCall(userText);
      if (!parsed) {
        return new Response(JSON.stringify({ error: "Could not parse tool call." }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const t: any = (tools as any)[parsed.name];
      if (!t || typeof t.execute !== "function") {
        return new Response(JSON.stringify({ error: `Unknown tool: ${parsed.name}` }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }

      const schema = t.inputSchema ?? t.parameters;
      if (schema?.safeParse) {
        const v = schema.safeParse(parsed.args);
        if (!v.success) {
          return new Response(
            JSON.stringify({ error: "Invalid tool args", issues: v.error.issues }),
            { status: 400, headers: { "content-type": "application/json" } },
          );
        }
        parsed.args = v.data;
      }

      try {
        const result = await t.execute(parsed.args);
        return new Response(JSON.stringify(result), {
          headers: { "content-type": "application/json" },
        });
      } catch (e: any) {
        return new Response(
          JSON.stringify({
            error: "Tool execution failed",
            tool: parsed.name,
            message: e?.shortMessage ?? e?.message ?? String(e),
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        );
      }
    }

    const maxSteps = 6;
    const result = await this.streamTextWithMessages(sessionId, messages.messages, {
      system: SYSTEM_PROMPT,
      maxSteps,
      stopWhen: stepCountIs(maxSteps),
      tools,
      experimental_toolCallStreaming: true,
      onError: (error: unknown) => console.error("Error processing message", error),
    });

    return result.toTextStreamResponse();
  }
}

export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
};
