"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { distanceMeters, bearingDegrees, compassDirection, EGG_CLAIM_RADIUS_M } from "@/lib/geo";

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

// A Google-Maps-style navigation arrow: points north (0deg) by default and
// gets rotated by `headingDeg` (0-360, clockwise from north) to show which
// way the patrol is currently walking.
function arrowDivIcon(color: string, headingDeg: number) {
  return L.divIcon({
    className: "",
    html: `<div style="width:36px;height:36px;display:flex;align-items:center;justify-content:center;transform:rotate(${headingDeg}deg)">
      <svg width="30" height="30" viewBox="0 0 24 24" style="filter:drop-shadow(0 1px 3px rgba(0,0,0,.6))">
        <path d="M12 2 L19 21 L12 16.5 L5 21 Z" fill="${color}" stroke="white" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>
    </div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

type DirectionsState = {
  eggId: string;
  eggTitle: string;
  loading: boolean;
  error: string | null;
  isFallback: boolean;
  arrived: boolean;
  compassText?: string;
  distanceText: string;
  durationText: string | null;
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
): Promise<{ coords: [number, number][]; distanceMeters: number; durationSeconds: number } | null> {
  const url = `https://api.mapbox.com/directions/v5/mapbox/walking/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full&access_token=${token}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const route = data.routes?.[0];
  if (!route) return null;
  return {
    coords: route.geometry.coordinates as [number, number][],
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}

export default function MapView({
  teams,
  eggs,
  settings,
  myLocation,
  myTeamId,
  enableDirections,
}: {
  teams: TeamMarker[];
  eggs: EggMarker[];
  settings: MapSettings;
  myLocation?: { lat: number; lng: number } | null;
  myTeamId?: string | null;
  enableDirections?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const routeLayerRef = useRef<L.LayerGroup | null>(null);
  const routeLineRef = useRef<L.Polyline | null>(null);
  const arrowMarkerRef = useRef<L.Marker | null>(null);
  const baseLayerRef = useRef<L.Layer | null>(null);
  const labelLayerRef = useRef<L.Layer | null>(null);
  const initializedForMode = useRef<string | null>(null);
  const eggsRef = useRef<EggMarker[]>(eggs);
  const myLocationRef = useRef(myLocation);
  const lastHeadingRef = useRef<number>(0);
  const lastRouteFetchRef = useRef<{ lat: number; lng: number; at: number } | null>(null);
  const [directions, setDirections] = useState<DirectionsState | null>(null);
  const directionsRef = useRef<DirectionsState | null>(null);

  eggsRef.current = eggs;
  myLocationRef.current = myLocation;
  directionsRef.current = directions;

  // Applies one navigation "tick": moves/rotates the live arrow, and — when
  // due for a refresh — refetches the walking route and redraws the line.
  // Called both for the very first fix after tapping "Directions" and for
  // every subsequent GPS update from the live watch below, so the arrow and
  // route stay current as the patrol actually walks.
  async function applyNavigationUpdate(
    eggId: string,
    loc: { lat: number; lng: number },
    opts: { isInitial: boolean; heading?: number | null }
  ) {
    const map = mapRef.current;
    const routeLayer = routeLayerRef.current;
    const egg = eggsRef.current.find((e) => e.id === eggId);
    const teamColor = teams.find((t) => t.id === myTeamId)?.color ?? "#2563eb";
    if (!map || !routeLayer || !egg) return;

    if (egg.collected) {
      routeLayer.clearLayers();
      routeLineRef.current = null;
      arrowMarkerRef.current = null;
      setDirections(null);
      return;
    }

    const distNow = distanceMeters(loc.lat, loc.lng, egg.lat, egg.lng);
    const arrived = distNow <= EGG_CLAIM_RADIUS_M;

    // Heading: prefer a real device-reported heading, then a heading derived
    // from movement (handled by the caller), then fall back to "point at
    // the egg" only until we have a first real reading.
    const heading = opts.heading ?? lastHeadingRef.current ?? bearingDegrees(loc.lat, loc.lng, egg.lat, egg.lng);
    lastHeadingRef.current = heading;

    if (arrowMarkerRef.current) {
      arrowMarkerRef.current.setLatLng([loc.lat, loc.lng]);
      arrowMarkerRef.current.setIcon(arrowDivIcon(teamColor, heading));
    } else {
      arrowMarkerRef.current = L.marker([loc.lat, loc.lng], { icon: arrowDivIcon(teamColor, heading), zIndexOffset: 1000 }).addTo(
        routeLayer
      );
    }

    const last = lastRouteFetchRef.current;
    const movedEnough = !last || distanceMeters(last.lat, last.lng, loc.lat, loc.lng) > 20;
    const timeEnough = !last || Date.now() - last.at > 20000;
    const shouldFetchRoute = !arrived && (opts.isInitial || movedEnough || timeEnough);

    if (opts.isInitial) {
      setDirections({
        eggId,
        eggTitle: egg.title,
        loading: true,
        error: null,
        isFallback: false,
        arrived: false,
        distanceText: "",
        durationText: null,
      });
    }

    if (shouldFetchRoute) {
      const mapboxToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
      let route = null;
      if (mapboxToken) {
        try {
          route = await fetchWalkingRoute(loc, { lat: egg.lat, lng: egg.lng }, mapboxToken);
        } catch {
          route = null;
        }
      }
      lastRouteFetchRef.current = { lat: loc.lat, lng: loc.lng, at: Date.now() };

      // Bail if things changed while the fetch was in flight (map gone,
      // directions closed, or a different egg is now targeted).
      if (!mapRef.current || !routeLayerRef.current || directionsRef.current?.eggId !== eggId) return;

      if (route) {
        const latlngs = route.coords.map(([lng, lat]) => [lat, lng] as [number, number]);
        if (routeLineRef.current) {
          routeLineRef.current.setLatLngs(latlngs);
          routeLineRef.current.setStyle({ dashArray: undefined });
        } else {
          routeLineRef.current = L.polyline(latlngs, { color: "#2563eb", weight: 5, opacity: 0.85 }).addTo(routeLayer);
        }
        if (opts.isInitial) map.fitBounds(routeLineRef.current.getBounds().pad(0.25), { maxZoom: 18 });

        setDirections({
          eggId,
          eggTitle: egg.title,
          loading: false,
          error: null,
          isFallback: false,
          arrived: false,
          distanceText: formatDistance(route.distanceMeters),
          durationText: formatDuration(route.durationSeconds),
        });
      } else {
        const straightLatlngs: [number, number][] = [
          [loc.lat, loc.lng],
          [egg.lat, egg.lng],
        ];
        if (routeLineRef.current) {
          routeLineRef.current.setLatLngs(straightLatlngs);
          routeLineRef.current.setStyle({ dashArray: "8 8" });
        } else {
          routeLineRef.current = L.polyline(straightLatlngs, { color: "#2563eb", weight: 4, opacity: 0.8, dashArray: "8 8" }).addTo(
            routeLayer
          );
        }
        if (opts.isInitial) map.fitBounds(routeLineRef.current.getBounds().pad(0.25), { maxZoom: 18 });

        const bearing = bearingDegrees(loc.lat, loc.lng, egg.lat, egg.lng);
        setDirections({
          eggId,
          eggTitle: egg.title,
          loading: false,
          error: null,
          isFallback: true,
          arrived: false,
          compassText: `Head ${compassDirection(bearing)}`,
          distanceText: formatDistance(distNow),
          durationText: null,
        });
      }
    } else if (arrived) {
      setDirections((prev) =>
        prev && prev.eggId === eggId
          ? { ...prev, loading: false, error: null, arrived: true, distanceText: formatDistance(distNow) }
          : prev
      );
    } else {
      // Between refetches, keep the distance readout live and cheap without
      // hitting the routing API on every single GPS tick.
      setDirections((prev) => (prev && prev.eggId === eggId ? { ...prev, distanceText: formatDistance(distNow) } : prev));
    }
  }

  async function requestDirections(eggId: string) {
    const egg = eggsRef.current.find((e) => e.id === eggId);
    if (!egg) return;

    routeLayerRef.current?.clearLayers();
    routeLineRef.current = null;
    arrowMarkerRef.current = null;
    lastRouteFetchRef.current = null;
    lastHeadingRef.current = bearingDegrees(
      myLocationRef.current?.lat ?? CAMP_CENTER[0],
      myLocationRef.current?.lng ?? CAMP_CENTER[1],
      egg.lat,
      egg.lng
    );

    setDirections({
      eggId,
      eggTitle: egg.title,
      loading: true,
      error: null,
      isFallback: false,
      arrived: false,
      distanceText: "",
      durationText: null,
    });

    // Don't just rely on the location the page happened to have cached from
    // its periodic background poll — actively ask the device for a fresh
    // fix right now, in direct response to the tap. This is both faster
    // and more reliable than waiting on the next poll tick, and re-prompts
    // for permission if it was never granted.
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
        arrived: false,
        distanceText: "",
        durationText: null,
      });
      return;
    }

    await applyNavigationUpdate(eggId, loc, { isInitial: true });
  }

  function closeDirections() {
    routeLayerRef.current?.clearLayers();
    routeLineRef.current = null;
    arrowMarkerRef.current = null;
    lastRouteFetchRef.current = null;
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
      routeLineRef.current = null;
      arrowMarkerRef.current = null;
    };
  }, []);

  // While navigation to an egg is active, track the device's live position
  // at normal GPS cadence (much more frequent than the app's slow 17s
  // background-location poll) so the arrow and route feel responsive, like
  // a real turn-by-turn app. Stops automatically when directions are closed.
  useEffect(() => {
    const eggId = directions?.eggId;
    if (!eggId || !("geolocation" in navigator)) return;

    let prevFix: { lat: number; lng: number } | null = myLocationRef.current ?? null;

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        let heading = pos.coords.heading;
        if ((heading == null || Number.isNaN(heading)) && prevFix) {
          const moved = distanceMeters(prevFix.lat, prevFix.lng, lat, lng);
          heading = moved > 5 ? bearingDegrees(prevFix.lat, prevFix.lng, lat, lng) : null;
        }
        prevFix = { lat, lng };
        void applyNavigationUpdate(eggId, { lat, lng }, { isInitial: false, heading: heading ?? undefined });
      },
      () => {
        // Ignore transient watch errors — the last known position/route
        // stays on screen and we'll pick back up on the next fix.
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directions?.eggId]);

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
  const navigatingEggId = directions?.eggId ?? null;
  useEffect(() => {
    const map = mapRef.current;
    const layerGroup = layerGroupRef.current;
    if (!map || !layerGroup) return;

    layerGroup.clearLayers();

    const points: L.LatLngExpression[] = [];

    for (const team of teams) {
      if (team.lat == null || team.lng == null) continue;
      points.push([team.lat, team.lng]);
      // While actively navigating, our own position is shown as the live
      // arrow (drawn in the route layer) instead of the plain dot here, so
      // we don't end up with two markers for the same team.
      if (navigatingEggId && team.id === myTeamId) continue;
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
  }, [teams, eggs, settings.mapMode, myTeamId, navigatingEggId]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="h-full w-full" />

      {directions && (
        <div className="absolute inset-x-2 bottom-2 z-[1000] rounded-2xl bg-white p-3 shadow-lg">
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
              {directions.arrived ? (
                <p className="text-sm font-bold text-emerald-700">🎉 You've arrived — look around for the egg!</p>
              ) : (
                <>
                  <p className="text-sm font-semibold text-zinc-600">
                    {directions.compassText ? `${directions.compassText} · ` : ""}
                    {directions.distanceText}
                    {directions.durationText ? ` · about ${directions.durationText} walking` : ""}
                  </p>
                  {directions.isFallback && (
                    <p className="mt-1 text-xs text-amber-700">
                      No mapped path found nearby — follow the dashed line and compass heading as your guide.
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
