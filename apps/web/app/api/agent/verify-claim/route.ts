// /web/app/api/agent/verify-claim/route.ts
import crypto from "node:crypto";
import { z } from "zod";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";
import { bountyAbi } from "@/lib/abi";
import { baseSepolia } from "@/lib/chain";
import { env } from "@/lib/env";
import { jsonError } from "@/lib/apiError";

const BodySchema = z.object({
  bountyId: z.coerce.number().int().nonnegative(),
  submissionId: z.coerce.number().int().positive(),
  artifactHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  declaredClient: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const requestId = crypto.randomUUID();
  const rpcUrl = process.env.RPC_URL || env.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL;
  const bountyAddress = (process.env.NEXT_PUBLIC_BOUNTY402_ADDRESS || env.bounty402Address) as Hex | undefined;
  const submitterPk = process.env.SUBMITTER_PRIVATE_KEY as Hex | undefined;
  const buyerPk = process.env.BUYER_PRIVATE_KEY as Hex | undefined;
  const workerUrl = process.env.WORKER_URL;

  if (!rpcUrl || !bountyAddress || !submitterPk || !buyerPk) {
    return jsonError(
      "MISSING_ENV",
      "Missing RPC_URL/NEXT_PUBLIC_RPC_URL/NEXT_PUBLIC_BOUNTY402_ADDRESS/SUBMITTER_PRIVATE_KEY/BUYER_PRIVATE_KEY",
      500,
      undefined,
      requestId,
    );
  }

  if (!workerUrl) {
    return jsonError("MISSING_ENV", "Missing WORKER_URL", 500, undefined, requestId);
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return jsonError("INVALID_BODY", "Invalid request body", 400, parsed.error.flatten(), requestId);
  }

  const submitterAccount = privateKeyToAccount(submitterPk);
  const buyerAccount = privateKeyToAccount(buyerPk);

  const walletClient = createWalletClient({
    account: submitterAccount,
    chain: baseSepolia,
    transport: http(rpcUrl),
  });
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(rpcUrl),
  });

  const fetchWithPayment = wrapFetchWithPayment(fetch, buyerAccount);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);

  try {
    console.log("verify-claim request", { ...parsed.data, workerUrl, requestId });

    const payload = {
      bountyId: parsed.data.bountyId,
      submissionId: parsed.data.submissionId,
      claimant: submitterAccount.address,
      artifactHash: parsed.data.artifactHash,
      client: buyerAccount.address,
      declaredClient: parsed.data.declaredClient ?? null,
    };

    // 1) discovery call (intentionally triggers 402) so we can show x402 quote in UI
    let x402 = null as any;
    try {
      const discoverRes = await fetch(`${workerUrl}/api/validator/verify`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-request-id": requestId },
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      // If it’s 402, parse the quote
      if (discoverRes.status === 402) {
        x402 = await discoverRes.json().catch(() => null);
      }
    } catch {
      // ignore discovery failures; paid request might still work
    }

    // 2) paid request (wrapFetchWithPayment handles payment header)
    const verifyRes = await fetchWithPayment(`${workerUrl}/api/validator/verify`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": requestId },
      signal: controller.signal,
      body: JSON.stringify(payload),
    });

    if (!verifyRes.ok) {
      const txt = await verifyRes.text().catch(() => "");
      return jsonError(
        "WORKER_VERIFY_FAILED",
        txt || "worker verify failed",
        500,
        { status: verifyRes.status },
        requestId,
      );
    }

    const verifyJson = await verifyRes.json();
    if (!verifyJson?.attestation?.signature) {
      console.error("worker verify failed", verifyRes.status, verifyJson);
      return jsonError("WORKER_NO_SIGNATURE", verifyJson?.error ?? "verification failed", 500, verifyJson, requestId);
    }

    const signature = verifyJson.attestation.signature as Hex;

    // simulate claim to surface revert reasons before sending tx
    try {
      await publicClient.simulateContract({
        address: bountyAddress,
        abi: bountyAbi,
        functionName: "claimWithAttestation",
        args: [BigInt(parsed.data.bountyId), BigInt(parsed.data.submissionId), signature],
        account: submitterAccount,
      });
    } catch (simErr) {
      console.error("simulate claim failed", simErr);
      return jsonError(
        "CLAIM_SIMULATION_FAILED",
        (simErr as Error)?.message ?? "claim simulation failed",
        400,
        undefined,
        requestId,
      );
    }

    const claimTxHash = await walletClient.writeContract({
      address: bountyAddress,
      abi: bountyAbi,
      functionName: "claimWithAttestation",
      args: [BigInt(parsed.data.bountyId), BigInt(parsed.data.submissionId), signature],
    });

    await publicClient.waitForTransactionReceipt({ hash: claimTxHash });

    return Response.json({
      requestId,
      x402: x402?.accepts?.[0] ?? x402 ?? null,
      verifyDigest: verifyJson.digest ?? verifyJson.attestation.digest,
      signature,
      claimTxHash,
      jobId: verifyJson.jobId,
      jobTxHash: verifyJson.jobTxHash ?? null,
      jobError: verifyJson.jobError ?? null,
      attestation: verifyJson.attestation,
    });
  } catch (err) {
    console.error("agent/verify-claim error", err);
    return jsonError("VERIFY_CLAIM_FAILED", (err as Error)?.message ?? "verify-claim failed", 500, undefined, requestId);
  } finally {
    clearTimeout(timeout);
  }
}
