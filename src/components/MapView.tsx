"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { distanceMeters, bearingDegrees, compassDirection } from "@/lib/geo";

export type TeamMarker = {
  id: string;
  name: string;
  color: string;
  lat: number | null;
  lng: number | null;
};

export type EggMarker = {
  id: string;
  title: string;
  lat: number;
  lng: number;
  hintPhotoUrl: string | null;
  collected?: boolean;
  collectedBy?: string | null;
};

// Fallback view centered on the camp (Qornayel, Lebanon) so the map always
// opens showing the hunt area instead of a blank world view when there are
// no markers to fit bounds to yet (e.g. before any team has shared GPS or
// unlocked an egg).
const CAMP_CENTER: [number, number] = [33.7975, 35.7638];
const CAMP_DEFAULT_ZOOM = 16;

export type MapSettings = {
  mapMode: "LIVE_TILES" | "STATIC_IMAGE";
  staticImageUrl?: string | null;
  boundsNorthLat?: number | null;
  boundsSouthLat?: number | null;
  boundsEastLng?: number | null;
  boundsWestLng?: number | null;
};

function teamDivIcon(color: string, name: string) {
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-8px)">
      <div style="background:${color};width:22px;height:22px;border-radius:50%;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>
      <div style="background:white;padding:1px 6px;border-radius:8px;font-size:11px;font-weight:700;margin-top:2px;box-shadow:0 1px 3px rgba(0,0,0,.3);white-space:nowrap">${name}</div>
    </div>`,
    iconSize: [0, 0],
  });
}

function eggDivIcon(collected: boolean) {
  return L.divIcon({
    className: "",
    html: `<div style="font-size:28px;opacity:${collected ? 0.4 : 1};filter:drop-shadow(0 1px 3px rgba(0,0,0,.5))">${collected ? "✅" : "🥚"}</div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

type DirectionsState = {
  eggId: string;
  eggTitle: string;
  loading: boolean;
  error: string | null;
  isFallback: boolean;
  compassText?: string;
  distanceText: string;
  durationText: string | null;
  steps: { instruction: string; distanceText: string }[];
};

function formatDistance(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`;
}

function formatDuration(s: number): string {
  const mins = Math.round(s / 60);
  return mins < 1 ? "under a minute" : `${mins} min`;
}

async function fetchWalkingRoute(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  token: string
): Promise<{
  coords: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
  steps: { instruction: string; distanceMeters: number }[];
} | null> {
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&steps=true&overview=full&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) return null;
  const steps = (route.legs?.[0]?.steps ?? []).map(
    (s: { maneuver?: { instruction?: string }; distance?: number }) => ({
      instruction: s.maneuver?.instruction ?? "Continue",
      distanceMeters: s.distance ?? 0,
    })
  );
  return {
    coords: route.geometry.coordinates as [number, number][],
    distanceMeters: route.distance,
    durationSeconds: route.duration,
    steps,
  };
}

export default function MapView({
  teams,
  eggs,
  settings,
  myLocation,
  enableDirections,
}: {
  teams: TeamMarker[];
  eggs: EggMarker[];
  settings: MapSettings;
  myLocation?: { lat: number; lng: number } | null;
  enableDirections?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const baseLayerRef = useRef<L.Layer | null>(null);
  const labelLayerRef = useRef<L.Layer | null>(null);
  const initializedForMode = useRef<string | null>(null);
  const eggsRef = useRef<EggMarker[]>(eggs);
  const myLocationRef = useRef(myLocation);
  const [directions, setDirections] = useState<DirectionsState | null>(null);

  eggsRef.current = eggs;
  myLocationRef.current = myLocation;

  async function requestDirections(eggId: string) {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    const egg = eggsRef.current.find((e) => e.id === eggId);
    if (!map || !routeLayer || !egg) return;

    routeLayer.clearLayers();

    setDirections({
      eggId,
      eggTitle: egg.title,
      loading: true,
      error: null,
      isFallback: false,
      distanceText: "",
      durationText: null,
      steps: [],
    });

    // Don't just rely on the location the page happened to have cached from
    // its periodic background poll — actively ask the device for a fresh
    // fix right now, in direct response to the tap. This is both faster
    // (no waiting for the next poll tick) and more reliable, since a fresh
    // on-demand request also re-prompts for permission if it was never
    // granted, instead of silently sitting on a stale/empty value forever.
    let loc = myLocationRef.current;
    if (!loc && "geolocation" in navigator) {
      loc = await new Promise<{ lat: number; lng: number } | null>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
          () => resolve(null),
          { enableHighAccuracy: true, timeout: 12000, maximumAge: 15000 }
        );
      });
    }

    if (!mapRef.current || !routeLayerRef.current) return;

    if (!loc) {
      setDirections({
        eggId,
        eggTitle: egg.title,
        loading: false,
        error:
          "Couldn't get your location. Make sure location access is allowed for this site (check your browser/phone settings), then tap Directions again.",
        isFallback: false,
        distanceText: "",
        durationText: null,
        steps: [],
      });
      return;
    }

    const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
    let route = null;
    if (mapboxToken) {
      try {
        route = await fetchWalkingRoute(loc, { lat: egg.lat, lng: egg.lng }, mapboxToken);
      } catch {
        route = null;
      }
    }

    // Bail if the map was unmounted while the request was in flight.
    if (!mapRef.current || !routeLayerRef.current) return;

    if (route) {
      const latlngs = route.coords.map(([lng, lat]) => [lat, lng] as [number, number]);
      const line = L.polyline(latlngs, { color: "#2563eb", weight: 5, opacity: 0.85 });
      line.addTo(routeLayerRef.current);
      L.circleMarker([loc.lat, loc.lng], {
        radius: 7,
        color: "#2563eb",
        fillColor: "#2563eb",
        fillOpacity: 1,
        weight: 2,
      }).addTo(routeLayerRef.current);
      map.fitBounds(line.getBounds().pad(0.25), { maxZoom: 18 });

      setDirections({
        eggId,
        eggTitle: egg.title,
        loading: false,
        error: null,
        isFallback: false,
        distanceText: formatDistance(route.distanceMeters),
        durationText: formatDuration(route.durationSeconds),
        steps: route.steps.map((s) => ({ instruction: s.instruction, distanceText: formatDistance(s.distanceMeters) })),
      });
    } else {
      // No mapped walking path found (common in open camp terrain) — fall
      // back to a straight dashed line plus a compass bearing and distance.
      const straight = L.polyline(
        [
          [loc.lat, loc.lng],
          [egg.lat, egg.lng],
        ],
        { color: "#2563eb", weight: 4, opacity: 0.8, dashArray: "8 8" }
      );
      straight.addTo(routeLayerRef.current);
      L.circleMarker([loc.lat, loc.lng], {
        radius: 7,
        color: "#2563eb",
        fillColor: "#2563eb",
        fillOpacity: 1,
        weight: 2,
      }).addTo(routeLayerRef.current);
      map.fitBounds(straight.getBounds().pad(0.25), { maxZoom: 18 });

      const dist = distanceMeters(loc.lat, loc.lng, egg.lat, egg.lng);
      const bearing = bearingDegrees(loc.lat, loc.lng, egg.lat, egg.lng);

      setDirections({
        eggId,
        eggTitle: egg.title,
        loading: false,
        error: null,
        isFallback: true,
        compassText: `Head ${compassDirection(bearing)}`,
        distanceText: formatDistance(dist),
        durationText: null,
        steps: [],
      });
    }
  }

  function closeDirections() {
    routeLayerRef.current?.clearLayers();
    setDirections(null);
  }

  const requestDirectionsRef = useRef(requestDirections);
  requestDirectionsRef.current = requestDirections;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView(CAMP_CENTER, CAMP_DEFAULT_ZOOM);

    mapRef.current = map;
    layerGroupRef.current = L.layerGroup().addTo(map);
    routeLayerRef.current = L.layerGroup().addTo(map);

    const onPopupOpen = (e: L.PopupEvent) => {
      const el = e.popup.getElement();
      const btn = el?.querySelector<HTMLButtonElement>("[data-directions-egg]");
      if (btn) {
        btn.addEventListener("click", () => {
          const eggId = btn.getAttribute("data-directions-egg");
          if (eggId) requestDirectionsRef.current(eggId);
        });
      }
    };
    map.on("popupopen", onPopupOpen);

    // Defensive: if the container's size isn't settled yet on first paint
    // (e.g. fonts/layout still shifting), Leaflet can lock in a 0x0 tile
    // grid. Re-measure shortly after mount and on any resize.
    const invalidate = () => map.invalidateSize();
    const raf = requestAnimationFrame(invalidate);
    const timeout = setTimeout(invalidate, 300);
    const resizeObserver = new ResizeObserver(invalidate);
    resizeObserver.observe(containerRef.current);
    window.addEventListener("resize", invalidate);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(timeout);
      resizeObserver.disconnect();
      window.removeEventListener("resize", invalidate);
      map.remove();
      mapRef.current = null;
      layerGroupRef.current = null;
      routeLayerRef.current = null;
    };
  }, []);

  // Set up base layer (tiles or static image) whenever mode/settings change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const key = `${settings.mapMode}:${settings.staticImageUrl}:${settings.boundsNorthLat}:${settings.boundsSouthLat}:${settings.boundsEastLng}:${settings.boundsWestLng}`;
    if (initializedForMode.current === key) return;
    initializedForMode.current = key;

    if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
      baseLayerRef.current = null;
    }
    if (labelLayerRef.current) {
      map.removeLayer(labelLayerRef.current);
      labelLayerRef.current = null;
    }

    if (settings.mapMode === "STATIC_IMAGE" && settings.staticImageUrl && settings.boundsNorthLat != null) {
      const bounds = L.latLngBounds(
        [settings.boundsSouthLat!, settings.boundsWestLng!],
        [settings.boundsNorthLat!, settings.boundsEastLng!]
      );
      const overlay = L.imageOverlay(settings.staticImageUrl, bounds);
      overlay.addTo(map);
      baseLayerRef.current = overlay;
      map.setMaxBounds(bounds.pad(0.2));
      map.fitBounds(bounds);
    } else {
      const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;

      if (mapboxToken) {
        // Mapbox's satellite-streets style: satellite imagery plus roads,
        // place names, and points of interest baked into one layer — the
        // closest free match to Google Maps' hybrid view.
        const mapbox = L.tileLayer(
          `https://api.mapbox.com/styles/v1/mapbox/satellite-streets-v12/tiles/{z}/{x}/{y}?access_token=${mapboxToken}`,
          {
            maxZoom: 22,
            tileSize: 512,
            zoomOffset: -1,
            attribution: "&copy; Mapbox &copy; OpenStreetMap",
          }
        );
        mapbox.addTo(map);
        baseLayerRef.current = mapbox;
      } else {
        // Fallback while no Mapbox token is configured: satellite imagery
        // (Esri World Imagery — free, no API key needed) with a roads/
        // boundaries overlay on top.
        const satellite = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
          {
            maxZoom: 19,
            attribution: "Tiles &copy; Esri",
          }
        );
        satellite.addTo(map);
        baseLayerRef.current = satellite;

        const labels = L.tileLayer(
          "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
          { maxZoom: 19, pane: "shadowPane" }
        );
        labels.addTo(map);
        labelLayerRef.current = labels;
      }

      map.setMaxBounds(undefined as unknown as L.LatLngBounds);
    }
  }, [settings.mapMode, settings.staticImageUrl, settings.boundsNorthLat, settings.boundsSouthLat, settings.boundsEastLng, settings.boundsWestLng]);

  // Draw team + egg markers, refreshed whenever data changes
  const fittedBoundsRef = useRef<L.LatLngBounds | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const points: L.LatLngExpression[] = [];

    for (const team of teams) {
      if (team.lat == null || team.lng == null) continue;
      points.push([team.lat, team.lng]);
      L.marker([team.lat, team.lng], { icon: teamDivIcon(team.color, team.name) }).addTo(layerGroup);
    }

    for (const egg of eggs) {
      points.push([egg.lat, egg.lng]);
      const marker = L.marker([egg.lat, egg.lng], { icon: eggDivIcon(!!egg.collected) }).addTo(layerGroup);
      const popupHtml = `
        <div style="max-width:200px">
          <strong>${egg.title}</strong>
          ${egg.collected ? `<div style="margin-top:2px;color:#16a34a;font-weight:600;font-size:12px">Collected${egg.collectedBy ? ` by ${egg.collectedBy}` : ""}</div>` : ""}
          ${egg.hintPhotoUrl ? `<img src="${egg.hintPhotoUrl}" style="width:100%;border-radius:8px;margin-top:6px" />` : ""}
          ${
            enableDirections && !egg.collected
              ? `<button data-directions-egg="${egg.id}" style="margin-top:8px;width:100%;background:#2563eb;color:white;border:none;border-radius:8px;padding:7px 0;font-size:13px;font-weight:700">🧭 Directions</button>`
              : ""
          }
        </div>`;
      marker.bindPopup(popupHtml);
    }

    // Re-fit the view whenever a marker shows up outside what we've already
    // framed — e.g. a team's real GPS location arriving after the initial
    // egg cluster was framed, possibly far from the camp during testing.
    // Once everything is in view we leave the map alone so it doesn't jump
    // around every poll tick while teams wander nearby.
    if (points.length > 0 && settings.mapMode === "LIVE_TILES") {
      const newBounds = L.latLngBounds(points);
      const alreadyFramed = fittedBoundsRef.current?.contains(newBounds) ?? false;
      if (!alreadyFramed) {
        const padded = newBounds.pad(0.3);
        map.fitBounds(padded, { maxZoom: 17 });
        fittedBoundsRef.current = padded;
      }
    }
  }, [teams, eggs, settings.mapMode]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {directions && (
        <div className="absolute inset-x-2 bottom-2 z-[1000] max-h-[45%] overflow-y-auto rounded-2xl bg-white p-3 shadow-lg">
          <div className="mb-1 flex items-start justify-between gap-2">
            <p className="text-sm font-bold text-zinc-800">🧭 {directions.eggTitle}</p>
            <button
              onClick={closeDirections}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600"
              aria-label="Close directions"
            >
              ✕
            </button>
          </div>

          {directions.loading && <p className="text-sm text-zinc-500">Finding the best walking route...</p>}

          {directions.error && <p className="text-sm font-medium text-amber-700">{directions.error}</p>}

          {!directions.loading && !directions.error && (
            <>
              <p className="mb-2 text-xs font-semibold text-zinc-500">
                {directions.compassText ? `${directions.compassText} · ` : ""}
                {directions.distanceText}
                {directions.durationText ? ` · about ${directions.durationText} walking` : ""}
              </p>

              {directions.isFallback && (
                <p className="mb-2 text-xs text-amber-700">
                  No mapped path found nearby — follow the dashed line and compass heading above as your guide.
                </p>
              )}

              {directions.steps.length > 0 && (
                <ol className="flex flex-col gap-1.5">
                  {directions.steps.map((step, i) => (
                    <li key={i} className="flex gap-2 text-sm text-zinc-700">
                      <span className="font-bold text-blue-600">{i + 1}.</span>
                      <span>
                        {step.instruction}
                        <span className="text-zinc-400"> — {step.distanceText}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
