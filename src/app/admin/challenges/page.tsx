"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { getSession } from "@/lib/session";

type UnlockType = "PHOTO_SUBMISSION" | "DISTANCE_WALKED";

type Challenge = {
  id: string;
  title: string;
  description: string;
  points: number;
  status: "open" | "collected";
  eggLat: number;
  eggLng: number;
  eggHintPhotoUrl: string | null;
  unlockType: UnlockType;
  requiredDistanceMeters: number | null;
  collectedBy: { teamName: string; at: string } | null;
};

type FormState = {
  title: string;
  description: string;
  points: string;
  eggLat: string;
  eggLng: string;
  hintPhoto: File | null;
  unlockType: UnlockType;
  requiredDistanceKm: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  points: "10",
  eggLat: "",
  eggLng: "",
  hintPhoto: null,
  unlockType: "PHOTO_SUBMISSION",
  requiredDistanceKm: "5",
};

function ChallengeForm({
  initial,
  onSubmit,
  submitLabel,
}: {
  initial: FormState;
  onSubmit: (form: FormState) => Promise<void>;
  submitLabel: string;
}) {
  const [form, setForm] = useState(initial);
  const [submitting, setSubmitting] = useState(false);

  const isDistanceUnlock = form.unlockType === "DISTANCE_WALKED";
  const canSubmit =
    form.title &&
    form.description &&
    form.eggLat &&
    form.eggLng &&
    (!isDistanceUnlock || (form.requiredDistanceKm && Number(form.requiredDistanceKm) > 0));

  return (
    <div className="flex flex-col gap-2">
      <input
        className="h-11 rounded-lg border border-zinc-300 px-3"
        placeholder="Title"
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
      <textarea
        className="rounded-lg border border-zinc-300 px-3 py-2"
        placeholder="Description"
        rows={2}
        value={form.description}
        onChange={(e) => setForm({ ...form, description: e.target.value })}
      />
      <div className="flex gap-2">
        <input
          className="h-11 w-24 rounded-lg border border-zinc-300 px-3"
          placeholder="Points"
          inputMode="numeric"
          value={form.points}
          onChange={(e) => setForm({ ...form, points: e.target.value })}
        />
        <input
          className="h-11 flex-1 rounded-lg border border-zinc-300 px-3"
          placeholder="Egg latitude"
          value={form.eggLat}
          onChange={(e) => setForm({ ...form, eggLat: e.target.value })}
        />
        <input
          className="h-11 flex-1 rounded-lg border border-zinc-300 px-3"
          placeholder="Egg longitude"
          value={form.eggLng}
          onChange={(e) => setForm({ ...form, eggLng: e.target.value })}
        />
      </div>

      <div className="rounded-lg border border-zinc-200 p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">How does it unlock?</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setForm({ ...form, unlockType: "PHOTO_SUBMISSION" })}
            className={`h-10 flex-1 rounded-lg text-sm font-medium ${
              !isDistanceUnlock ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600"
            }`}
          >
            📸 Photo/video proof
          </button>
          <button
            type="button"
            onClick={() => setForm({ ...form, unlockType: "DISTANCE_WALKED" })}
            className={`h-10 flex-1 rounded-lg text-sm font-medium ${
              isDistanceUnlock ? "bg-zinc-800 text-white" : "bg-zinc-100 text-zinc-600"
            }`}
          >
            🚶 Walk a distance
          </button>
        </div>
        {isDistanceUnlock && (
          <div className="mt-2 flex items-center gap-2">
            <input
              className="h-10 w-24 rounded-lg border border-zinc-300 px-3"
              placeholder="5"
              inputMode="decimal"
              value={form.requiredDistanceKm}
              onChange={(e) => setForm({ ...form, requiredDistanceKm: e.target.value })}
            />
            <span className="text-sm text-zinc-500">km walked by the patrol unlocks this egg automatically</span>
          </div>
        )}
      </div>

      <label className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 text-sm text-zinc-500">
        {form.hintPhoto ? form.hintPhoto.name : "Upload hint photo (optional)"}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => setForm({ ...form, hintPhoto: e.target.files?.[0] ?? null })}
        />
      </label>
      <button
        onClick={async () => {
          setSubmitting(true);
          try {
            await onSubmit(form);
            setForm(EMPTY_FORM);
          } finally {
            setSubmitting(false);
          }
        }}
        disabled={submitting || !canSubmit}
        className="h-11 rounded-lg bg-zinc-800 font-bold text-white disabled:opacity-40"
      >
        {submitting ? "Saving..." : submitLabel}
      </button>
    </div>
  );
}

function buildFormData(form: FormState): FormData {
  const fd = new FormData();
  fd.append("title", form.title);
  fd.append("description", form.description);
  fd.append("points", form.points);
  fd.append("eggLat", form.eggLat);
  fd.append("eggLng", form.eggLng);
  fd.append("unlockType", form.unlockType);
  if (form.unlockType === "DISTANCE_WALKED") fd.append("requiredDistanceKm", form.requiredDistanceKm);
  if (form.hintPhoto) fd.append("hintPhoto", form.hintPhoto);
  return fd;
}

export default function AdminChallengesPage() {
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    const res = await apiGet<{ challenges: Challenge[] }>("/api/challenges");
    setChallenges(res.challenges);
  }

  useEffect(() => {
    load();
  }, []);

  async function createChallenge(form: FormState) {
    const session = getSession();
    if (!session) return;
    await fetch("/api/challenges", {
      method: "POST",
      headers: { Authorization: `Bearer ${session.token}` },
      body: buildFormData(form),
    });
    setShowAdd(false);
    load();
  }

  async function updateChallenge(id: string, form: FormState) {
    const session = getSession();
    if (!session) return;
    await fetch(`/api/challenges/${id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${session.token}` },
      body: buildFormData(form),
    });
    setEditingId(null);
    load();
  }

  async function deleteChallenge(id: string, title: string) {
    if (!confirm(`Delete "${title}"? This also removes any submissions and egg claims for it. This can't be undone.`)) {
      return;
    }
    const session = getSession();
    if (!session) return;
    setDeletingId(id);
    try {
      await fetch(`/api/challenges/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${session.token}` },
      });
      load();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-800">Challenges</h1>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-bold text-white"
        >
          {showAdd ? "Cancel" : "+ Add challenge"}
        </button>
      </div>

      {showAdd && (
        <div className="mb-4 rounded-2xl border border-zinc-200 bg-white p-4">
          <ChallengeForm initial={EMPTY_FORM} onSubmit={createChallenge} submitLabel="Create challenge" />
        </div>
      )}

      <div className="flex flex-col gap-3">
        {challenges.map((c) => (
          <div key={c.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
            {editingId === c.id ? (
              <ChallengeForm
                initial={{
                  title: c.title,
                  description: c.description,
                  points: String(c.points),
                  eggLat: String(c.eggLat),
                  eggLng: String(c.eggLng),
                  hintPhoto: null,
                  unlockType: c.unlockType,
                  requiredDistanceKm: c.requiredDistanceMeters ? String(c.requiredDistanceMeters / 1000) : "5",
                }}
                onSubmit={(form) => updateChallenge(c.id, form)}
                submitLabel="Save changes"
              />
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-lg font-bold text-zinc-800">{c.title}</h2>
                  <span className="whitespace-nowrap rounded-full bg-emerald-700 px-2 py-1 text-xs font-bold text-white">
                    {c.points} pts
                  </span>
                </div>
                <p className="mt-1 text-sm text-zinc-500">{c.description}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Egg at {c.eggLat.toFixed(5)}, {c.eggLng.toFixed(5)}
                </p>
                <p className="mt-1 text-xs font-medium text-zinc-500">
                  {c.unlockType === "DISTANCE_WALKED"
                    ? `🚶 Unlocks after walking ${((c.requiredDistanceMeters ?? 0) / 1000).toFixed(1)} km`
                    : "📸 Unlocks via photo/video proof"}
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {c.status === "collected" && c.collectedBy
                    ? `Collected by ${c.collectedBy.teamName}`
                    : "Open"}
                </p>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={() => setEditingId(c.id)}
                    className="rounded-full bg-zinc-100 px-3 py-1 text-sm font-medium text-zinc-700"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => deleteChallenge(c.id, c.title)}
                    disabled={deletingId === c.id}
                    className="rounded-full bg-red-50 px-3 py-1 text-sm font-medium text-red-600 disabled:opacity-50"
                  >
                    {deletingId === c.id ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
