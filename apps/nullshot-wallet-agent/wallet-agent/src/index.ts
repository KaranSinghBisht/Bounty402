import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { ToolboxService } from '@nullshot/agent';
import { stepCountIs, type LanguageModel, type Provider } from 'ai';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { AiSdkAgent, AIUISDKMessage } from '@nullshot/agent';
import { z } from 'zod';
import mcpConfig from '../mcp.json';
import { makeWalletTools } from './tools/wallet';

const EnvSchema = z.object({
		AI_PROVIDER: z.literal('google'),
		AI_PROVIDER_API_KEY: z.string().min(1),
		MODEL_ID: z.string().min(1),
	});

const SYSTEM_PROMPT = `
You are a wallet analyzer for Base Sepolia.

You have tools available. When the user asks you to "Call <tool>" or "Use <tool>", you MUST call the tool.

IMPORTANT OUTPUT RULE:
- If the user says "return ONLY the JSON tool result" (or equivalent),
  then you MUST:
  1) call the tool with the provided args
  2) respond with ONLY the exact JSON returned by the tool
  3) do not add any other text, formatting, markdown, or explanation.

Other rules:
- Never invent balances or transfers. Use tools for on-chain data.
- Default chain is Base Sepolia (84532).
- If the user did not provide required args for a tool, ask for them.
`;

function getValidatedEnv(env: Env) {
	return EnvSchema.parse(env);
}

function tryParseToolCall(text: string): { name: string; args: unknown } | null {
	// expects: Call <toolName> with {...}
	const m = text.match(/Call\s+([A-Za-z0-9_]+)\s+with\s+(\{[\s\S]*\})/i);
	if (!m) return null;

	const name = m[1];
	try {
		const args = JSON.parse(m[2]);
		return { name, args };
	} catch {
		return null;
	}
}

// Instantiate application with Hono
const app = new Hono<{ Bindings: Env }>();

app.use(
	'*',
	cors({
		origin: '*', // Allow any origin for development; restrict this in production
		allowMethods: ['POST', 'GET', 'OPTIONS'],
		allowHeaders: ['Content-Type'],
		exposeHeaders: ['X-Session-Id'],
		maxAge: 86400, // 24 hours
	}),
);

// Debug endpoint to verify tool injection
app.get('/debug/tools', (c) => {
	const tools = makeWalletTools(c.env);
	return c.json({ toolNames: Object.keys(tools) });
});

// Route all requests to the durable object instance based on session
app.all('/agent/chat/:sessionId?', async (c) => {
	const { AGENT } = c.env;
	var sessionIdStr = c.req.param('sessionId');

	if (!sessionIdStr || sessionIdStr == '') {
		sessionIdStr = crypto.randomUUID();
	}

	const id = AGENT.idFromName(sessionIdStr);

	const forwardRequest = new Request(`https://internal.com/agent/chat/${sessionIdStr}`, {
		method: c.req.method,
		headers: c.req.raw.headers,
		body: c.req.raw.body,
	});

	// Forward to Durable Object and get response
	return await AGENT.get(id).fetch(forwardRequest);
});

//
export class SimplePromptAgent extends AiSdkAgent<Env> {
	private readonly runtimeEnv: Env;

	constructor(state: DurableObjectState, env: Env) {
		 const validatedEnv = getValidatedEnv(env);
		 // Use string model identifier - AI SDK v5 supports this directly
		 let model: LanguageModel;
		 switch (validatedEnv.AI_PROVIDER) {
		   case "google": {
			 const provider: Provider = createGoogleGenerativeAI({
			   apiKey: validatedEnv.AI_PROVIDER_API_KEY,
			   // (or omit apiKey and set GOOGLE_GENERATIVE_AI_API_KEY instead)
			 });
			 model = provider.languageModel(validatedEnv.MODEL_ID);
			 break;
		   }
		   default:
			 // This should never happen due to validation above, but TypeScript requires this
			 throw new Error(`Unsupported AI provider: ${env.AI_PROVIDER}`);
		 }

		 const safeEnv = {
			...env,
			AI_PROVIDER_API_KEY: '(hidden)',
			BASESCAN_API_KEY: env.BASESCAN_API_KEY ? '(hidden)' : undefined,
		 };

		 super(state, env, model, [new ToolboxService(safeEnv as any, mcpConfig)]);
		 this.runtimeEnv = env;
	  }

	async processMessage(sessionId: string, messages: AIUISDKMessage): Promise<Response> {
		const tools = makeWalletTools(this.runtimeEnv);
		const last = messages.messages?.[messages.messages.length - 1];
		const userText =
			typeof last?.content === 'string'
				? last.content
				: Array.isArray(last?.content)
				? last.content.map((c: any) => c.text ?? '').join(' ')
				: '';
		const jsonOnly = /only the json/i.test(userText);

		if (jsonOnly) {
			const parsed = tryParseToolCall(userText);
			if (!parsed) {
				return new Response(JSON.stringify({ error: 'Could not parse tool call.' }), {
					status: 400,
					headers: { 'content-type': 'application/json' },
				});
			}

			const t: any = (tools as any)[parsed.name];
			if (!t || typeof t.execute !== 'function') {
				return new Response(JSON.stringify({ error: `Unknown tool: ${parsed.name}` }), {
					status: 400,
					headers: { 'content-type': 'application/json' },
				});
			}

			const result = await t.execute(parsed.args);
			return new Response(JSON.stringify(result), {
				headers: { 'content-type': 'application/json' },
			});
		}

		const system = SYSTEM_PROMPT;
		const maxSteps = 5;
		// Use the protected streamTextWithMessages method - model is handled automatically by the agent
		const result = await this.streamTextWithMessages(
			sessionId,
			messages.messages,
			{
			  system,
			  maxSteps,
			  stopWhen: stepCountIs(maxSteps),
			  // Enable MCP tools from imported mcp.json
			  tools,
			  experimental_toolCallStreaming: true,
			  onError: (error: unknown) => {
				console.error("Error processing message", error);
			  },
			},
		  );
	  
		  return result.toTextStreamResponse();
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return app.fetch(request, env, ctx);
	},
};
