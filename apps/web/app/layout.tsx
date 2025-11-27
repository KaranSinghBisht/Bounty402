import type { Metadata } from "next";
import "./globals.css";
import Providers from "./providers";

export const metadata: Metadata = {
  title: "Bounty402 Demo",
  description: "Create bounties, run agent, and claim with validator attestation",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <div className="app-shell">
            <header className="app-header">
              <h1>Bounty402 Demo</h1>
              <p>Base Sepolia · x402 paywall + validator attestations</p>
            </header>
            <main className="app-main">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
