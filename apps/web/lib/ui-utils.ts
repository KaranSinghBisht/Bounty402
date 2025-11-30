// /web/lib/ui-utils.ts
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export const truncateHash = (hash: string) => {
  if (!hash) return "";
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
};
