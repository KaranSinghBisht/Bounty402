import { z } from "zod";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { wrapFetchWithPayment } from "x402-fetch";
import { bountyAbi } from "@/lib/abi";
import { baseSepolia } from "@/lib/chain";
import { env } from "@/lib/env";

const BodySchema = z.object({
  bountyId: z.coerce.number().int().nonnegative(),
  submissionId: z.coerce.number().int().nonnegative(),
  artifactHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/),
  client: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional(),
});

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rpcUrl = process.env.RPC_URL || env.rpcUrl || process.env.NEXT_PUBLIC_RPC_URL;
  const bountyAddress = (process.env.NEXT_PUBLIC_BOUNTY402_ADDRESS || env.bounty402Address) as Hex | undefined;
  const submitterPk = process.env.SUBMITTER_PRIVATE_KEY as Hex | undefined;
  const buyerPk = process.env.BUYER_PRIVATE_KEY as Hex | undefined;
  const workerUrl = process.env.WORKER_URL;

  if (!rpcUrl || !bountyAddress || !submitterPk || !buyerPk) {
    return Response.json(
      {
        error:
          "Missing RPC_URL/NEXT_PUBLIC_RPC_URL/NEXT_PUBLIC_BOUNTY402_ADDRESS/SUBMITTER_PRIVATE_KEY/BUYER_PRIVATE_KEY",
      },
      { status: 500 },
    );
  }

  if (!workerUrl) {
    return Response.json({ error: "Missing WORKER_URL" }, { status: 500 });
  }

  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
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
    console.log("verify-claim request", { ...parsed.data, workerUrl });

    const verifyRes = await fetchWithPayment(`${workerUrl}/api/validator/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        bountyId: String(parsed.data.bountyId),
        submissionId: String(parsed.data.submissionId),
        claimant: submitterAccount.address,
        artifactHash: parsed.data.artifactHash,
        client: buyerAccount.address,
        declaredClient: parsed.data.client ?? null,
      }),
    });

    if (!verifyRes.ok) {
      return Response.json({ error: await verifyRes.text() }, { status: 500 });
    }

    const verifyJson = await verifyRes.json();
    if (!verifyJson?.attestation?.signature) {
      console.error("worker verify failed", verifyRes.status, verifyJson);
      return Response.json({ error: verifyJson?.error ?? "verification failed" }, { status: 500 });
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
      return Response.json({ error: (simErr as Error)?.message ?? "claim simulation failed" }, { status: 400 });
    }

    const claimTxHash = await walletClient.writeContract({
      address: bountyAddress,
      abi: bountyAbi,
      functionName: "claimWithAttestation",
      args: [BigInt(parsed.data.bountyId), BigInt(parsed.data.submissionId), signature],
    });

    await publicClient.waitForTransactionReceipt({ hash: claimTxHash });

    return Response.json({
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
    return Response.json({ error: (err as Error)?.message ?? "verify-claim failed" }, { status: 500 });
  } finally {
    clearTimeout(timeout);
  }
}
