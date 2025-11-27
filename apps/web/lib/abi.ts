// /web/lib/abi.ts
import type { Abi } from "viem";

export const bountyAbi = [
  {
    type: "event",
    name: "BountyCreated",
    inputs: [
      { name: "bountyId", type: "uint256", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "reward", type: "uint256", indexed: false },
      { name: "deadline", type: "uint64", indexed: false },
      { name: "specHash", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "function",
    name: "createBountyWithValidator",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "reward", type: "uint256" },
      { name: "deadline", type: "uint64" },
      { name: "specHash", type: "bytes32" },
      { name: "validator", type: "address" },
    ],
    outputs: [{ name: "bountyId", type: "uint256" }],
  },
  {
    type: "function",
    name: "submitWork",
    stateMutability: "nonpayable",
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "artifactHash", type: "bytes32" },
      { name: "uri", type: "string" },
    ],
    outputs: [{ name: "submissionId", type: "uint256" }],
  },
  {
    type: "function",
    name: "claimWithAttestation",
    stateMutability: "nonpayable",
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "submissionId", type: "uint256" },
      { name: "signature", type: "bytes" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "attestationDigest",
    stateMutability: "view",
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "submissionId", type: "uint256" },
      { name: "claimant", type: "address" },
      { name: "artifactHash", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
  {
    type: "function",
    name: "submissionCount",
    stateMutability: "view",
    inputs: [{ name: "bountyId", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "bountyCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "getWinner",
    stateMutability: "view",
    inputs: [{ name: "bountyId", type: "uint256" }],
    outputs: [
      { name: "winner", type: "address" },
      { name: "submissionId", type: "uint256" },
    ],
  },
// eslint-disable-next-line @typescript-eslint/ban-types
] as const satisfies Abi;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
// eslint-disable-next-line @typescript-eslint/ban-types
] as const satisfies Abi;
