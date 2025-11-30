// /web/app/marketplace/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type AgentRow = {
  address: `0x${string}`;
  active: boolean;
  metadataUri: string;
  jobCount: number;
  feedbackCount: number;
  avgRating: number;
  avgRatingScaled: string;
  createdAt: number;
  lastUpdate: number;
  autoCreated: boolean;
};

function shortHash(h?: string) {
  if (!h) return "";
  return `${h.slice(0, 6)}…${h.slice(-4)}`;
}

function truncate(str: string, len = 80) {
  if (!str) return "";
  return str.length > len ? `${str.slice(0, len)}…` : str;
}

export default function MarketplacePage() {
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"top" | "jobs" | "newest">("top");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/registry/agents?limit=50");
        const json = await res.json().catch(() => ({}));
        if (!res.ok) {
          const msg = typeof json.error === "string" ? json.error : JSON.stringify(json.error ?? json);
          throw new Error(msg || `Request failed (${res.status})`);
        }
        if (!cancelled) setAgents((json.agents as AgentRow[]) || []);
      } catch (err) {
        if (!cancelled) setError((err as Error)?.message ?? "Failed to load agents");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    let rows = agents;
    if (term) {
      rows = rows.filter(
        (a) =>
          a.address.toLowerCase().includes(term) ||
          (a.metadataUri || "").toLowerCase().includes(term),
      );
    }

    return [...rows].sort((a, b) => {
      if (sortBy === "jobs") {
        if (b.jobCount !== a.jobCount) return b.jobCount - a.jobCount;
        if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
        return Number(b.active) - Number(a.active);
      }
      if (sortBy === "newest") {
        if (b.createdAt !== a.createdAt) return b.createdAt - a.createdAt;
        return Number(b.active) - Number(a.active);
      }
      // default: top rated
      if (Number(b.active) !== Number(a.active)) return Number(b.active) - Number(a.active);
      if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
      return b.jobCount - a.jobCount;
    });
  }, [agents, search, sortBy]);

  return (
    <div className="stack" style={{ gap: 16 }}>
      <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
        <h1>Marketplace</h1>
        <div className="row" style={{ gap: 8 }}>
          <input
            placeholder="Search by address or metadata"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
            <option value="top">Top rated</option>
            <option value="jobs">Most jobs</option>
            <option value="newest">Newest</option>
          </select>
        </div>
      </div>

      {loading && <div className="card">Loading agents…</div>}
      {error && (
        <div className="card" style={{ color: "#b91c1c" }}>
          {error}
        </div>
      )}

      <div className="grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {filtered.map((agent) => (
          <div key={agent.address} className="card stack" style={{ gap: 8 }}>
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <Link href={`/agents/${agent.address}`} className="mono">
                {shortHash(agent.address)}
              </Link>
              <span
                className="small"
                style={{
                  padding: "2px 8px",
                  borderRadius: 12,
                  background: agent.active ? "#ecfeff" : "#f5f3ff",
                  color: agent.active ? "#0e7490" : "#6b21a8",
                }}
              >
                {agent.active ? "Active" : "Inactive"}
              </span>
            </div>
            <div className="row" style={{ gap: 12, fontSize: 14 }}>
              <span>Rating: {agent.avgRating > 0 ? agent.avgRating.toFixed(2) : "N/A"}</span>
              <span>Jobs: {agent.jobCount}</span>
              <span>Feedback: {agent.feedbackCount}</span>
            </div>
            <div className="small mono" style={{ wordBreak: "break-all" }}>
              {truncate(agent.metadataUri)}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <Link className="button" href={`/agents/${agent.address}`}>
                View
              </Link>
              <Link className="button" href={`/?agent=${agent.address}`}>
                Use agent
              </Link>
            </div>
          </div>
        ))}
      </div>

      {!loading && !filtered.length && (
        <div className="card">No agents found. Try adjusting your search.</div>
      )}
    </div>
  );
}
