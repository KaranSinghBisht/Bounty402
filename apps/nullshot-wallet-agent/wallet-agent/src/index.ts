// /wallet-agent/src/index.ts
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
You are a wallet analyzer for Base Sepolia (84532).

You have tools:
- getEthBalance({address})
- getUsdcBalance({address})
- getRecentUsdcTransfers({address,maxBlocks})

When user provides a wallet address, you MUST use the tools above to fetch real on-chain data
and then produce a compact JSON risk/profile summary.

IMPORTANT OUTPUT RULE:
If the user asks for ONLY JSON, respond with ONLY valid JSON (no markdown, no extra text).
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

app.onError((err, c) => {
	console.error("wallet-agent unhandled error:", (err as any)?.stack || err);
	return c.text("Internal server error", 500);
});

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

		const addr = userText.match(/0x[a-fA-F0-9]{40}/)?.[0];

		if (addr) {
			const [eth, usdc, transfers] = await Promise.all([
				(tools as any).getEthBalance.execute({ address: addr }),
				(tools as any).getUsdcBalance.execute({ address: addr }),
				(tools as any).getRecentUsdcTransfers.execute({ address: addr, maxBlocks: 20_000 }),
			]);

			const activity = transfers.transfers?.length ? 'active' : 'inactive';

			const summary = {
				chainId: 84532,
				address: addr,
				balances: { eth, usdc },
				recentUsdcTransfers: transfers,
				profile: {
					activity,
					notes: ['Base Sepolia testnet', 'Heuristic-only; use mainnet data for real risk scoring.'],
				},
			};

			return new Response(JSON.stringify(summary), {
				headers: { 'content-type': 'application/json' },
			});
		}

		const system = SYSTEM_PROMPT;
		const maxSteps = 5;
		const result = await this.streamTextWithMessages(sessionId, messages.messages, {
			system,
			maxSteps,
			stopWhen: stepCountIs(maxSteps),
			tools,
			experimental_toolCallStreaming: true,
			onError: (error: unknown) => {
				console.error('Error processing message', error);
			},
		});

		return result.toTextStreamResponse();
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		return app.fetch(request, env, ctx);
	},
};
