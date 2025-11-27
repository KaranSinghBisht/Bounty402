// /web/app/api/agent/verify-claim/route.ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";
import { bountyAbi } from "@/lib/abi";
import { baseSepolia } from "@/lib/chain";

const BodySchema = z.object({
  bountyId: z.coerce.number().int().nonnegative(),
  submissionId: z.coerce.number().int().nonnegative(),
  artifactHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
});

export const runtime = "nodejs";

function respondError(message: string, details?: unknown, status = 500) {
  return NextResponse.json({ error: { message, details } }, { status });
}

export async function POST(req: Request) {
  const rpcUrl = process.env.RPC_URL || process.env.NEXT_PUBLIC_RPC_URL;
  const bountyAddress = process.env.NEXT_PUBLIC_BOUNTY402_ADDRESS as Hex | undefined;
  const submitterPk = process.env.SUBMITTER_PRIVATE_KEY as Hex | undefined;
  const buyerPk = process.env.BUYER_PRIVATE_KEY as Hex | undefined;
  const workerUrl = process.env.WORKER_URL;

  if (!rpcUrl || !bountyAddress || !submitterPk || !buyerPk || !workerUrl) {
    return respondError(
      "Missing RPC_URL/NEXT_PUBLIC_BOUNTY402_ADDRESS/SUBMITTER_PRIVATE_KEY/BUYER_PRIVATE_KEY/WORKER_URL",
      undefined,
      500,
    );
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return respondError("Invalid request body", parsed.error.flatten(), 400);
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

  try {
    console.log("verify-claim request", { ...parsed.data, workerUrl });

    const verifyRes = await fetchWithPayment(`${workerUrl}/api/validator/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        bountyId: String(parsed.data.bountyId),
        submissionId: String(parsed.data.submissionId),
        claimant: submitterAccount.address,
        claimer: submitterAccount.address,
        artifactHash: parsed.data.artifactHash,
      }),
    });

    const verifyJson = await verifyRes.json();
    if (!verifyRes.ok || !verifyJson?.attestation?.signature) {
      console.error("worker verify failed", verifyRes.status, verifyJson);
      return respondError("verification failed", verifyJson?.error ?? verifyJson, verifyRes.status);
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
      return respondError("claim simulation failed", `${simErr}`, 400);
    }

    const claimTxHash = await walletClient.writeContract({
      address: bountyAddress,
      abi: bountyAbi,
      functionName: "claimWithAttestation",
      args: [BigInt(parsed.data.bountyId), BigInt(parsed.data.submissionId), signature],
    });

    await publicClient.waitForTransactionReceipt({ hash: claimTxHash });

    return NextResponse.json({
      verifyDigest: verifyJson.digest ?? verifyJson.attestation.digest,
      signature,
      claimTxHash,
    });
  } catch (err) {
    console.error("agent/verify-claim error", err);
    return respondError("verify-claim failed", `${err}`, 500);
  }
}
