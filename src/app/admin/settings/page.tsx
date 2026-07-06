"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/apiClient";
import { getSession } from "@/lib/session";

type Settings = {
  mapMode: "LIVE_TILES" | "STATIC_IMAGE";
  staticImageUrl: string | null;
  boundsNorthLat: number | null;
  boundsSouthLat: number | null;
  boundsEastLng: number | null;
  boundsWestLng: number | null;
};

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mapMode, setMapMode] = useState<"LIVE_TILES" | "STATIC_IMAGE">("LIVE_TILES");
  const [north, setNorth] = useState("");
  const [south, setSouth] = useState("");
  const [east, setEast] = useState("");
  const [west, setWest] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ settings: Settings }>("/api/settings").then((res) => {
      setSettings(res.settings);
      setMapMode(res.settings.mapMode);
      setNorth(res.settings.boundsNorthLat != null ? String(res.settings.boundsNorthLat) : "");
      setSouth(res.settings.boundsSouthLat != null ? String(res.settings.boundsSouthLat) : "");
      setEast(res.settings.boundsEastLng != null ? String(res.settings.boundsEastLng) : "");
      setWest(res.settings.boundsWestLng != null ? String(res.settings.boundsWestLng) : "");
    });
  }, []);

  async function save() {
    const session = getSession();
    if (!session) return;
    setSaving(true);
    setMessage(null);
    try {
      const fd = new FormData();
      fd.append("mapMode", mapMode);
      if (north) fd.append("boundsNorthLat", north);
      if (south) fd.append("boundsSouthLat", south);
      if (east) fd.append("boundsEastLng", east);
      if (west) fd.append("boundsWestLng", west);
      if (image) fd.append("staticImage", image);

      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { Authorization: `Bearer ${session.token}` },
        body: fd,
      });
      if (!res.ok) throw new Error("Save failed");
      const data = await res.json();
      setSettings(data.settings);
      setMessage("Settings saved.");
    } catch {
      setMessage("Couldn't save settings — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  if (!settings) return <div className="flex-1 p-4 text-zinc-400">Loading...</div>;

  return (
    <div className="flex flex-1 flex-col overflow-y-auto p-4">
      <h1 className="mb-3 text-xl font-bold text-zinc-800">Map Settings</h1>

      <div className="flex flex-col gap-4 rounded-2xl border border-zinc-200 bg-white p-4">
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-700">Map backend</p>
          <div className="flex gap-2">
            <button
              onClick={() => setMapMode("LIVE_TILES")}
              className={`flex-1 rounded-xl py-3 text-sm font-bold ${
                mapMode === "LIVE_TILES" ? "bg-emerald-700 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              Live tiles (needs internet)
            </button>
            <button
              onClick={() => setMapMode("STATIC_IMAGE")}
              className={`flex-1 rounded-xl py-3 text-sm font-bold ${
                mapMode === "STATIC_IMAGE" ? "bg-emerald-700 text-white" : "bg-zinc-100 text-zinc-600"
              }`}
            >
              Static map image
            </button>
          </div>
        </div>

        {mapMode === "STATIC_IMAGE" && (
          <>
            {settings.staticImageUrl && (
              <img src={settings.staticImageUrl} alt="Current map" className="w-full rounded-xl" />
            )}
            <label className="flex h-11 cursor-pointer items-center justify-center rounded-lg border border-dashed border-zinc-300 text-sm text-zinc-500">
              {image ? image.name : "Upload static map image"}
              <input type="file" accept="image/*" className="hidden" onChange={(e) => setImage(e.target.files?.[0] ?? null)} />
            </label>

            <p className="text-sm font-medium text-zinc-700">GPS bounds of the image corners</p>
            <div className="grid grid-cols-2 gap-2">
              <input
                className="h-11 rounded-lg border border-zinc-300 px-3"
                placeholder="North latitude"
                value={north}
                onChange={(e) => setNorth(e.target.value)}
              />
              <input
                className="h-11 rounded-lg border border-zinc-300 px-3"
                placeholder="South latitude"
                value={south}
                onChange={(e) => setSouth(e.target.value)}
              />
              <input
                className="h-11 rounded-lg border border-zinc-300 px-3"
                placeholder="East longitude"
                value={east}
                onChange={(e) => setEast(e.target.value)}
              />
              <input
                className="h-11 rounded-lg border border-zinc-300 px-3"
                placeholder="West longitude"
                value={west}
                onChange={(e) => setWest(e.target.value)}
              />
            </div>
          </>
        )}

        <button
          onClick={save}
          disabled={saving}
          className="h-12 rounded-xl bg-zinc-800 font-bold text-white disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
        {message && <p className="text-sm font-medium text-zinc-600">{message}</p>}
      </div>
    </div>
  );
}
