// /web/lib/abi.ts
import type { Abi } from "viem";
import Bounty402 from "./abi/Bounty402.abi.json";

export const bountyAbi = Bounty402.abi as Abi;

// keep erc20Abi exactly as you have it below
export const erc20Abi = [
  // ...
// eslint-disable-next-line @typescript-eslint/ban-types
] as const satisfies Abi;