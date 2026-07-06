"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";

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

export default function MapView({
  teams,
  eggs,
  settings,
}: {
  teams: TeamMarker[];
  eggs: EggMarker[];
  settings: MapSettings;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const baseLayerRef = useRef<L.Layer | null>(null);
  const labelLayerRef = useRef<L.Layer | null>(null);
  const initializedForMode = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView(CAMP_CENTER, CAMP_DEFAULT_ZOOM);

    mapRef.current = map;
    layerGroupRef.current = L.layerGroup().addTo(map);

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

  return <div ref={containerRef} className="h-full w-full" />;
}
