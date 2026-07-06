"use client";

import { useState } from "react";
import { compressImage } from "@/lib/compressImage";
import { submitWithRetry } from "@/lib/offlineQueue";
import { getSession } from "@/lib/session";

const MAX_FILES = 6;

type PickedFile = { file: File; previewUrl: string; isVideo: boolean };

export default function PhotoSubmitForm({
  url,
  fileField,
  extraFields,
  buttonLabel,
  onDone,
}: {
  url: string;
  fileField: string;
  extraFields?: Record<string, string>;
  buttonLabel: string;
  onDone: (result: { ok: boolean; queued: boolean; message: string }) => void;
}) {
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);

  async function handleFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow picking the same file again later
    if (selected.length === 0) return;

    const room = MAX_FILES - picked.length;
    const accepted = selected.slice(0, room);
    if (selected.length > room) {
      setLimitNotice(`Only added ${accepted.length} — you can attach up to ${MAX_FILES} files per submission.`);
    } else {
      setLimitNotice(null);
    }

    const processed = await Promise.all(
      accepted.map(async (file) => {
        const isVideo = file.type.startsWith("video/");
        const compressed = isVideo ? file : await compressImage(file);
        return { file: compressed, previewUrl: URL.createObjectURL(compressed), isVideo };
      })
    );

    setPicked((prev) => [...prev, ...processed]);
  }

  function removeAt(index: number) {
    setPicked((prev) => {
      URL.revokeObjectURL(prev[index].previewUrl);
      return prev.filter((_, i) => i !== index);
    });
  }

  async function handleSubmit() {
    if (picked.length === 0) return;
    const session = getSession();
    if (!session) return;

    setSubmitting(true);
    try {
      const result = await submitWithRetry({
        url,
        method: "POST",
        token: session.token,
        kind: "multipart",
        fields: extraFields,
        fileField,
        files: picked.map((p) => p.file),
      });

      if (result.queued) {
        onDone({ ok: false, queued: true, message: "No connection — this will be sent automatically once you're back online." });
        return;
      }

      if (result.ok) {
        onDone({ ok: true, queued: false, message: "Submitted!" });
      } else {
        const body = await result.response.json().catch(() => ({}));
        onDone({ ok: false, queued: false, message: body.error ?? "Submission failed." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  const canAddMore = picked.length < MAX_FILES;

  return (
    <div className="flex flex-col gap-3">
      {picked.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {picked.map((p, i) => (
            <div key={p.previewUrl} className="relative">
              {p.isVideo ? (
                <video src={p.previewUrl} className="h-24 w-full rounded-lg object-cover" />
              ) : (
                <img src={p.previewUrl} alt="Preview" className="h-24 w-full rounded-lg object-cover" />
              )}
              <button
                onClick={() => removeAt(i)}
                className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white shadow"
                aria-label="Remove"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {canAddMore && (
        <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-400">
          <span className="text-4xl">📷</span>
          <span className="text-sm font-medium">
            {picked.length === 0 ? "Tap to take a photo/video or choose from gallery" : "Add another photo or video"}
          </span>
          <span className="text-xs text-zinc-400">You can attach up to {MAX_FILES}</span>
          <input type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFiles} />
        </label>
      )}

      {limitNotice && <p className="text-xs font-medium text-amber-700">{limitNotice}</p>}

      <button
        onClick={handleSubmit}
        disabled={picked.length === 0 || submitting}
        className="h-14 rounded-xl bg-emerald-700 text-lg font-bold text-white active:bg-emerald-800 disabled:opacity-40"
      >
        {submitting ? "Sending..." : buttonLabel}
      </button>
    </div>
  );
}
