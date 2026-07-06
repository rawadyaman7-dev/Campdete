"use client";

import { useState } from "react";
import { compressImage } from "@/lib/compressImage";
import { submitWithRetry } from "@/lib/offlineQueue";
import { getSession } from "@/lib/session";

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
  const [preview, setPreview] = useState<string | null>(null);
  const [previewIsVideo, setPreviewIsVideo] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const isVideo = selected.type.startsWith("video/");
    const compressed = isVideo ? selected : await compressImage(selected);
    setFile(compressed);
    setPreviewIsVideo(isVideo);
    setPreview(URL.createObjectURL(compressed));
  }

  async function handleSubmit() {
    if (!file) return;
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
        file,
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

  return (
    <div className="flex flex-col gap-3">
      {preview ? (
        previewIsVideo ? (
          <video src={preview} controls className="max-h-64 w-full rounded-xl object-cover" />
        ) : (
          <img src={preview} alt="Preview" className="max-h-64 w-full rounded-xl object-cover" />
        )
      ) : (
        <label className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-300 text-zinc-400">
          <span className="text-4xl">📷</span>
          <span className="text-sm font-medium">Tap to take a photo/video or choose from gallery</span>
          <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
        </label>
      )}

      {preview && (
        <label className="text-center text-sm font-medium text-emerald-700 underline">
          Choose a different photo or video
          <input type="file" accept="image/*,video/*" className="hidden" onChange={handleFile} />
        </label>
      )}

      <button
        onClick={handleSubmit}
        disabled={!file || submitting}
        className="h-14 rounded-xl bg-emerald-700 text-lg font-bold text-white active:bg-emerald-800 disabled:opacity-40"
      >
        {submitting ? "Sending..." : buttonLabel}
      </button>
    </div>
  );
}
