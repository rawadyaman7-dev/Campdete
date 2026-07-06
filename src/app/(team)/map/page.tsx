"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { getSession } from "@/lib/session";
import { apiGet } from "@/lib/apiClient";
import { submitWithRetry } from "@/lib/offlineQueue";
import type { TeamMarker, EggMarker, MapSettings } from "@/components/MapView";

const MapView = dynamic(() => import("@/components/MapView"), { ssr: false });

const POLL_MS = 17000;

type ChallengeResponse = {
  id: string;
  title: string;
  status: string;
  egg: { lat: number; lng: number; hintPhotoUrl: string | null } | null;
};

type TeamResponse = {
  id: string;
  name: string;
  color: string;
  currentLat: number | null;
  currentLng: number | null;
};

export default function MapPage() {
  const [teams, setTeams] = useState<TeamMarker[]>([]);
  const [eggs, setEggs] = useState<EggMarker[]>([]);
  const [settings, setSettings] = useState<MapSettings>({ mapMode: "LIVE_TILES" });
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const [teamsRes, challengesRes] = await Promise.all([
          apiGet<{ teams: TeamResponse[] }>("/api/teams"),
          apiGet<{ challenges: ChallengeResponse[] }>("/api/challenges"),
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
          challengesRes.challenges
            .filter((c) => c.status === "racing" && c.egg)
            .map((c) => ({ id: c.id, title: c.title, lat: c.egg!.lat, lng: c.egg!.lng, hintPhotoUrl: c.egg!.hintPhotoUrl }))
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

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setLocationError("This device doesn't support GPS location.");
      return;
    }

    const rawSession = getSession();
    if (!rawSession || rawSession.role !== "team") return;
    const teamId = rawSession.teamId;
    const token = rawSession.token;

    let cancelled = false;

    function sendLocation() {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          if (cancelled) return;
          setLocationError(null);
          await submitWithRetry({
            url: `/api/teams/${teamId}/location`,
            method: "POST",
            token,
            kind: "json",
            jsonBody: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          });
        },
        (err) => setLocationError(`Location unavailable: ${err.message}`),
        { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 }
      );
    }

    sendLocation();
    const interval = setInterval(sendLocation, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="relative flex flex-1 flex-col">
      {locationError && (
        <div className="absolute top-2 left-2 right-2 z-30 rounded-lg bg-amber-100 px-3 py-2 text-xs font-medium text-amber-800 shadow">
          {locationError}
        </div>
      )}
      <MapView teams={teams} eggs={eggs} settings={settings} />
    </div>
  );
}
