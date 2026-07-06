"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { apiGet } from "@/lib/apiClient";

type Challenge = {
  id: string;
  title: string;
  description: string;
  points: number;
  status: "open" | "pending" | "racing" | "rejected" | "collected";
  unlockType: "PHOTO_SUBMISSION" | "DISTANCE_WALKED";
  distanceProgress: { walkedMeters: number; requiredMeters: number } | null;
  collectedBy: { teamName: string; at: string } | null;
  myClaimPending: boolean;
};

const STATUS_STYLES: Record<Challenge["status"], string> = {
  open: "bg-zinc-100 text-zinc-600",
  pending: "bg-amber-100 text-amber-700",
  rejected: "bg-red-100 text-red-700",
  racing: "bg-emerald-100 text-emerald-700",
  collected: "bg-zinc-200 text-zinc-500",
};

const STATUS_LABEL: Record<Challenge["status"], string> = {
  open: "Open",
  pending: "Pending review",
  rejected: "Rejected — resubmit",
  racing: "Egg unlocked — go find it!",
  collected: "Collected",
};

export default function ChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await apiGet<{ challenges: Challenge[] }>("/api/challenges");
        if (!cancelled) {
          setChallenges(res.challenges);
          setError(null);
        }
      } catch {
        if (!cancelled) setError("Couldn't refresh challenges. Showing last known data.");
      }
    }

    load();
    const interval = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <h1 className="mb-3 text-xl font-bold text-zinc-800">Challenges</h1>
      {error && <p className="mb-3 text-xs font-medium text-amber-700">{error}</p>}

      <div className="flex flex-col gap-3">
        {challenges.map((c) => (
          <Link
            key={c.id}
            href={`/challenges/${c.id}`}
            className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm active:bg-zinc-50"
          >
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-lg font-bold text-zinc-800">{c.title}</h2>
              <span className="whitespace-nowrap rounded-full bg-emerald-700 px-2 py-1 text-xs font-bold text-white">
                {c.points} pts
              </span>
            </div>
            <p className="mt-1 text-sm text-zinc-500">{c.description}</p>
            <span className={`mt-2 inline-block rounded-full px-2 py-1 text-xs font-semibold ${STATUS_STYLES[c.status]}`}>
              {c.status === "collected" && c.collectedBy
                ? `Collected by ${c.collectedBy.teamName}`
                : c.status === "racing" && c.myClaimPending
                ? "Claim submitted — awaiting confirmation"
                : c.status === "open" && c.unlockType === "DISTANCE_WALKED" && c.distanceProgress
                ? `🚶 ${(c.distanceProgress.walkedMeters / 1000).toFixed(2)} / ${(c.distanceProgress.requiredMeters / 1000).toFixed(1)} km walked`
                : c.status === "rejected" && c.unlockType === "DISTANCE_WALKED"
                ? "Reset by admin"
                : STATUS_LABEL[c.status]}
            </span>
          </Link>
        ))}
        {challenges.length === 0 && !error && <p className="text-sm text-zinc-400">Loading challenges...</p>}
      </div>
    </div>
  );
}
