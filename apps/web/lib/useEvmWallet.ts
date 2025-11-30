"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createWalletClient, custom, type Address, type Hex } from "viem";
import { baseSepolia } from "@/lib/chain";

const BASE_SEPOLIA_HEX = `0x${baseSepolia.id.toString(16)}` as Hex;

type Eip1193 = {
  request: (args: { method: string; params?: any[] }) => Promise<any>;
  on?: (event: string, cb: (...args: any[]) => void) => void;
  removeListener?: (event: string, cb: (...args: any[]) => void) => void;
};

export function useEvmWallet() {
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);

  const ethereum = useMemo<Eip1193 | null>(() => {
    if (typeof window === "undefined") return null;
    return ((window as any).ethereum as Eip1193) ?? null;
  }, []);

  const refresh = useCallback(async () => {
    if (!ethereum) return;
    const accounts = (await ethereum.request({ method: "eth_accounts" })) as string[];
    setAddress((accounts?.[0] as Address) ?? null);
    const idHex = (await ethereum.request({ method: "eth_chainId" })) as string;
    setChainId(parseInt(idHex, 16));
  }, [ethereum]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!ethereum?.on) return;
    const onAccounts = (accounts: string[]) => setAddress((accounts?.[0] as Address) ?? null);
    const onChain = (idHex: string) => setChainId(parseInt(idHex, 16));
    ethereum.on("accountsChanged", onAccounts);
    ethereum.on("chainChanged", onChain);
    return () => {
      ethereum.removeListener?.("accountsChanged", onAccounts);
      ethereum.removeListener?.("chainChanged", onChain);
    };
  }, [ethereum]);

  const connect = useCallback(async () => {
    if (!ethereum) throw new Error("No injected wallet found (install MetaMask).");
    await ethereum.request({ method: "eth_requestAccounts" });
    await refresh();
  }, [ethereum, refresh]);

  const switchToBaseSepolia = useCallback(async () => {
    if (!ethereum) throw new Error("No injected wallet found.");
    try {
      await ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: BASE_SEPOLIA_HEX }],
      });
    } catch (err: any) {
      if (err?.code === 4902) {
        await ethereum.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: BASE_SEPOLIA_HEX,
              chainName: "Base Sepolia",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: ["https://sepolia.base.org"],
              blockExplorerUrls: ["https://sepolia.basescan.org"],
            },
          ],
        });
      } else {
        throw err;
      }
    }
    await refresh();
  }, [ethereum, refresh]);

  const walletClient = useMemo(() => {
    if (!ethereum) return null;
    return createWalletClient({
      chain: baseSepolia,
      transport: custom(ethereum),
    });
  }, [ethereum]);

  return {
    address,
    chainId,
    isConnected: Boolean(address),
    walletClient,
    connect,
    switchToBaseSepolia,
  };
}
