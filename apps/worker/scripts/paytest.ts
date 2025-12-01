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
  body: JSON.stringify({
    bountyId: 1,
    submissionId: 1,
    claimant: "0xea37E48367B3f722022f45617C7b46b0E533BA40",
    artifactHash: "0xb50278e342b6ecccf8fff27ce861d0df8b82394cd1a134c268d813133fbfdef0",
    client: account.address,
    // declaredClient: "0xUSER_WALLET_ADDRESS_HERE",
  }),
});

console.log("status:", res.status);
console.log("body:", await res.text());
