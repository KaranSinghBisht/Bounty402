import "dotenv/config";
import { wrapFetchWithPayment } from "x402-fetch";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

const pk = process.env.BUYER_PRIVATE_KEY as Hex;
const workerUrl = process.env.WORKER_URL ?? "http://localhost:8787";
if (!pk) throw new Error("Missing BUYER_PRIVATE_KEY");

const account = privateKeyToAccount(pk);
const fetchWithPayment = wrapFetchWithPayment(fetch, account);

const res = await fetchWithPayment(`${workerUrl}/api/validator/verify`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ bountyId: "1", submissionHash: "demo" }),
});

console.log("status:", res.status);
console.log("body:", await res.text());