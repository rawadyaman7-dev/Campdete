"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { apiGet } from "@/lib/apiClient";
import type { TeamMarker, EggMarker, MapSettings } from "@/components/MapView";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const POLL_MS = 10000;

type AdminChallengeResponse = {
  id: string;
  title: string;
  status: "open" | "collected";
  eggLat: number;
  eggLng: number;
  eggHintPhotoUrl: string | null;
  collectedBy: { teamName: string; at: string } | null;
};

type TeamResponse = {
  id: string;
  name: string;
  color: string;
  currentLat: number | null;
  currentLng: number | null;
};

export default function AdminMapPage() {
  const [teams, setTeams] = useState<TeamMarker[]>([]);
  const [eggs, setEggs] = useState<EggMarker[]>([]);
  const [settings, setSettings] = useState<MapSettings>({ mapMode: "LIVE_TILES" });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [teamsRes, challengesRes] = await Promise.all([
          apiGet<{ teams: TeamResponse[] }>("/api/teams"),
          apiGet<{ challenges: AdminChallengeResponse[] }>("/api/challenges"),
        ]);
        if (cancelled) return;
        setTeams(
          teamsRes.teams.map((t) => ({
            id: t.id,
            name: t.name,
            color: t.color,
            lat: t.currentLat,
            lng: t.currentLng,
          }))
        );
        setEggs(
          challengesRes.challenges.map((c) => ({
            id: c.id,
            title: c.title,
            lat: c.eggLat,
            lng: c.eggLng,
            hintPhotoUrl: c.eggHintPhotoUrl,
            collected: c.status === "collected",
            collectedBy: c.collectedBy?.teamName ?? null,
          }))
        );
      } catch {
        // transient network error; next poll tick will retry
      }
    }

    apiGet<{ settings: MapSettings }>("/api/settings")
      .then((res) => !cancelled && setSettings(res.settings))
      .catch(() => {});

    poll();
    const interval = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const seenTeams = teams.filter((t) => t.lat != null && t.lng != null).length;

  return (
    <div className="relative flex flex-1 flex-col">
      <div className="absolute top-2 left-2 right-2 z-30 flex flex-wrap items-center gap-3 rounded-lg bg-white/95 px-3 py-2 text-xs font-medium text-zinc-600 shadow">
        <span>🥚 Open egg</span>
        <span>✅ Collected</span>
        <span className="ml-auto">
          {seenTeams}/{teams.length} patrols reporting GPS
        </span>
      </div>
      <MapView teams={teams} eggs={eggs} settings={settings} />
    </div>
  );
}
