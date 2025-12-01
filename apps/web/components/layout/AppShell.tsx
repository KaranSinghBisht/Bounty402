// /web/components/layout/AppShell.tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useEffect, useState } from "react";
import { Background } from "@/components/shared/Background";
import { Button } from "@/components/ui/Primitives";
import { cn, truncateHash } from "@/lib/ui-utils";
import { Box, MessageSquare, Wallet } from "lucide-react";
import { useEvmWallet } from "@/lib/useEvmWallet";
import { baseSepolia } from "@/lib/chain";

export const AppShell = ({ children }: { children?: React.ReactNode }) => {
  const pathname = usePathname();
  const { address, chainId, isConnected, connect, switchToBaseSepolia } = useEvmWallet();
  const onBaseSepolia = chainId === baseSepolia.id;
  const [escrow, setEscrow] = useState<{ formatted: string; symbol: string } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/escrow/balance");
        if (!res.ok) return;
        const json = await res.json();
        setEscrow({ formatted: json.formatted, symbol: json.symbol });
      } catch {
        // ignore balance errors; show placeholder
      }
    })();
  }, []);

  const statusDotClass = !isConnected
    ? "bg-red-500"
    : onBaseSepolia
      ? "bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]"
      : "bg-yellow-500";

  const statusText = !isConnected
    ? "Not connected"
    : onBaseSepolia
      ? truncateHash(address!)
      : `Wrong network (${chainId})`;

  const ctaLabel = !isConnected
    ? "Connect MetaMask"
    : onBaseSepolia
      ? "Connected"
      : "Switch to Base Sepolia";

  const onCtaClick = async () => {
    if (!isConnected) {
      return connect();
    }
    if (!onBaseSepolia) {
      return switchToBaseSepolia();
    }
    return;
  };

  const navItems = [
    { icon: MessageSquare, label: "Chat Assistant", path: "/my-agent" },
    { icon: Box, label: "Marketplace", path: "/marketplace" },
  ];

  const activeNav = navItems.find((item) => pathname.startsWith(item.path));
  const currentLabel =
    activeNav?.label || pathname.split("/").filter(Boolean).pop()?.replace("-", " ") || "home";

  return (
    <div className="min-h-screen flex text-foreground font-sans bg-background selection:bg-primary/20">
      <Background />

      <aside className="hidden md:flex flex-col w-72 border-r border-white/5 bg-[#0B0D12]/80 backdrop-blur-xl fixed h-full z-50">
        <div className="p-6 flex items-center gap-3">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-primary/20">
              B
            </div>
            <span className="font-bold tracking-tight text-lg">Bounty402</span>
          </Link>
        </div>

        <nav className="flex-1 px-4 space-y-1 mt-4">
          <div className="text-xs font-bold text-muted-foreground/50 px-4 mb-2 uppercase tracking-wider">Menu</div>
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.path);
            const Icon = item.icon;
            return (
              <Link key={item.path} href={item.path}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 group",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:bg-white/[0.03] hover:text-foreground",
                  )}
                >
                  <Icon
                    className={cn(
                      "w-4 h-4 transition-colors",
                      isActive ? "text-primary" : "text-muted-foreground group-hover:text-foreground",
                    )}
                  />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="p-4 rounded-xl bg-gradient-to-br from-white/[0.03] to-transparent border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs text-muted-foreground">Escrow Balance</p>
              <Wallet className="w-3 h-3 text-muted-foreground" />
            </div>
            <p className="text-xl font-mono font-bold text-white">
              {escrow ? `${escrow.formatted} ${escrow.symbol}` : "—"}
            </p>
            <p className="text-[10px] text-muted-foreground mt-1">
              {escrow ? "Escrowed in Bounty402 contract" : "Set NEXT_PUBLIC_USDC_ADDRESS to show escrow"}
            </p>
          </div>
        </div>
      </aside>

      <main className="flex-1 md:ml-72 flex flex-col min-h-screen relative z-10">
        <header className="h-16 border-b border-white/5 bg-background/50 backdrop-blur-md sticky top-0 z-40 px-6 flex items-center justify-between">
          <div className="md:hidden">
            <Link href="/" className="font-bold text-primary">
              B402
            </Link>
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm text-muted-foreground">
            <span className="opacity-50">App</span>
            <span className="opacity-30">/</span>
            <span className="text-foreground capitalize font-medium">{currentLabel}</span>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-white/[0.03] border border-white/5 transition-all hover:bg-white/[0.05]">
              <div className={cn("w-2 h-2 rounded-full", statusDotClass)} />
              <span className="text-xs font-mono text-muted-foreground">{statusText}</span>
            </div>
            <Button
              size="sm"
              variant={!isConnected || !onBaseSepolia ? "default" : "glass"}
              onClick={() => void onCtaClick()}
              className={isConnected && onBaseSepolia ? "text-muted-foreground hover:text-foreground" : ""}
            >
              {ctaLabel}
            </Button>
          </div>
        </header>

        <div className="p-6 md:p-10 max-w-7xl mx-auto w-full animate-in fade-in slide-in-from-bottom-2 duration-700">
          {children}
        </div>
      </main>

      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0B0D12]/90 backdrop-blur-lg border-t border-white/10 flex items-center justify-around z-50 px-2">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.path);
          const Icon = item.icon;
          return (
            <Link
              key={item.path}
              href={item.path}
              className={cn("flex flex-col items-center gap-1 p-2 rounded-lg w-full", isActive && "bg-white/5")}
            >
              <Icon className={cn("w-5 h-5", isActive ? "text-primary" : "text-muted-foreground")} />
              <span className={cn("text-[10px]", isActive ? "text-primary font-medium" : "text-muted-foreground")}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
};
