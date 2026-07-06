"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPostJson } from "@/lib/apiClient";

type LeaderboardEntry = { id: string; name: string; color: string; points: number };
type HistoryEntry = {
  id: string;
  challengeTitle: string;
  teamName: string;
  points: number;
  submittedAt: string;
  approvedAt: string | null;
  collectedAt: string | null;
};

const MEDALS = ["🥇", "🥈", "🥉"];

export default function LeaderboardView({ admin = false }: { admin?: boolean }) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  async function load() {
    try {
      const res = await apiGet<{ leaderboard: LeaderboardEntry[]; history: HistoryEntry[] }>("/api/leaderboard");
      setLeaderboard(res.leaderboard);
      setHistory(res.history);
    } catch {
      // keep last known data on transient failure
    }
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, []);

  async function revoke(entry: HistoryEntry) {
    if (
      !confirm(
        `Revoke "${entry.challengeTitle}" for ${entry.teamName}? This removes their ${entry.points} points, reopens the egg if they'd already collected it, and lets them resubmit.`
      )
    ) {
      return;
    }
    setRevokingId(entry.id);
    try {
      await apiPostJson(`/api/submissions/${entry.id}/revoke`, {});
      await load();
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <h1 className="mb-3 text-xl font-bold text-zinc-800">Leaderboard</h1>

      <div className="flex flex-col gap-2">
        {leaderboard.map((team, i) => (
          <div key={team.id} className="flex items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
            <span className="w-8 text-center text-xl">{MEDALS[i] ?? i + 1}</span>
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: team.color }} />
            <span className="flex-1 font-bold text-zinc-800">{team.name}</span>
            <span className="text-lg font-extrabold text-emerald-700">{team.points}</span>
          </div>
        ))}
      </div>

      <h2 className="mb-2 mt-6 text-lg font-bold text-zinc-800">History</h2>
      <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <th className="p-2">Challenge</th>
              <th className="p-2">Team</th>
              <th className="p-2">Points</th>
              <th className="p-2">Submitted</th>
              <th className="p-2">Approved</th>
              <th className="p-2">Collected</th>
              {admin && <th className="p-2" />}
            </tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.id} className="border-t border-zinc-100">
                <td className="p-2 font-medium text-zinc-700">{h.challengeTitle}</td>
                <td className="p-2">{h.teamName}</td>
                <td className="p-2">{h.points}</td>
                <td className="p-2 text-zinc-400">{new Date(h.submittedAt).toLocaleTimeString()}</td>
                <td className="p-2 text-zinc-400">{h.approvedAt ? new Date(h.approvedAt).toLocaleTimeString() : "—"}</td>
                <td className="p-2 text-zinc-400">{h.collectedAt ? new Date(h.collectedAt).toLocaleTimeString() : "—"}</td>
                {admin && (
                  <td className="p-2">
                    <button
                      onClick={() => revoke(h)}
                      disabled={revokingId === h.id}
                      className="whitespace-nowrap rounded-full bg-red-50 px-3 py-1 text-xs font-bold text-red-600 disabled:opacity-50"
                    >
                      {revokingId === h.id ? "Revoking..." : "Revoke"}
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td className="p-3 text-zinc-400" colSpan={admin ? 7 : 6}>
                  No approved submissions yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
