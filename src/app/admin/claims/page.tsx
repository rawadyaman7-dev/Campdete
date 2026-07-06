"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPostJson } from "@/lib/apiClient";

type Claim = {
  id: string;
  claimLat: number | null;
  claimLng: number | null;
  withinRange: boolean;
  claimedAt: string;
  team: { name: string; color: string };
  challenge: { title: string; points: number; eggLat: number; eggLng: number };
};

export default function AdminClaimsPage() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await apiGet<{ claims: Claim[] }>("/api/egg-claims?pending=true");
    setClaims(res.claims);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  async function decide(id: string, action: "confirm" | "deny") {
    setBusyId(id);
    try {
      await apiPostJson(`/api/egg-claims/${id}/confirm`, { action });
      setClaims((prev) => prev.filter((c) => c.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <h1 className="mb-3 text-xl font-bold text-zinc-800">Egg Claims</h1>

      <div className="flex flex-col gap-3">
        {claims.map((c) => (
          <div key={c.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: c.team.color }} />
                <span className="font-bold text-zinc-800">{c.team.name}</span>
              </div>
              <span className="text-xs text-zinc-400">{new Date(c.claimedAt).toLocaleTimeString()}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-zinc-600">
              {c.challenge.title} · {c.challenge.points} pts
            </p>
            <p className={`mt-1 text-sm font-semibold ${c.withinRange ? "text-emerald-700" : "text-amber-700"}`}>
              {c.withinRange ? "✓ GPS confirms team was at the egg site" : "⚠ GPS was outside the expected range — verify in person"}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => decide(c.id, "confirm")}
                disabled={busyId === c.id}
                className="h-12 flex-1 rounded-xl bg-emerald-700 font-bold text-white active:bg-emerald-800 disabled:opacity-50"
              >
                Confirm collection
              </button>
              <button
                onClick={() => decide(c.id, "deny")}
                disabled={busyId === c.id}
                className="h-12 flex-1 rounded-xl bg-red-600 font-bold text-white active:bg-red-700 disabled:opacity-50"
              >
                Deny
              </button>
            </div>
          </div>
        ))}
        {claims.length === 0 && <p className="text-sm text-zinc-400">No claims awaiting confirmation.</p>}
      </div>
    </div>
  );
}
