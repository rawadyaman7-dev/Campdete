"use client";

import { useEffect, useState } from "react";
import { apiGet, apiPostJson } from "@/lib/apiClient";

type Submission = {
  id: string;
  proofPhotoUrls: string[];
  submittedAt: string;
  team: { name: string; color: string };
  challenge: { title: string; points: number };
};

const VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".3gp"];

function isVideoUrl(url: string): boolean {
  const withoutQuery = url.split("?")[0].toLowerCase();
  return VIDEO_EXTENSIONS.some((ext) => withoutQuery.endsWith(ext));
}

export default function AdminReviewPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    const res = await apiGet<{ submissions: Submission[] }>("/api/submissions?status=pending");
    setSubmissions(res.submissions);
  }

  useEffect(() => {
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, []);

  async function review(id: string, action: "approve" | "reject") {
    setBusyId(id);
    try {
      await apiPostJson(`/api/submissions/${id}/review`, { action });
      setSubmissions((prev) => prev.filter((s) => s.id !== id));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <h1 className="mb-3 text-xl font-bold text-zinc-800">Pending Submissions</h1>

      <div className="flex flex-col gap-3">
        {submissions.map((s) => (
          <div key={s.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.team.color }} />
                <span className="font-bold text-zinc-800">{s.team.name}</span>
              </div>
              <span className="text-xs text-zinc-400">{new Date(s.submittedAt).toLocaleTimeString()}</span>
            </div>
            <p className="mt-1 text-sm font-medium text-zinc-600">
              {s.challenge.title} · {s.challenge.points} pts
            </p>
            <div className={`mt-2 grid gap-2 ${s.proofPhotoUrls.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
              {s.proofPhotoUrls.map((url) =>
                isVideoUrl(url) ? (
                  <video key={url} src={url} controls className="max-h-80 w-full rounded-xl object-cover" />
                ) : (
                  <img key={url} src={url} alt="Proof" className="max-h-80 w-full rounded-xl object-cover" />
                )
              )}
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => review(s.id, "approve")}
                disabled={busyId === s.id}
                className="h-12 flex-1 rounded-xl bg-emerald-700 font-bold text-white active:bg-emerald-800 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => review(s.id, "reject")}
                disabled={busyId === s.id}
                className="h-12 flex-1 rounded-xl bg-red-600 font-bold text-white active:bg-red-700 disabled:opacity-50"
              >
                Reject
              </button>
            </div>
          </div>
        ))}
        {submissions.length === 0 && <p className="text-sm text-zinc-400">No pending submissions.</p>}
      </div>
    </div>
  );
}
