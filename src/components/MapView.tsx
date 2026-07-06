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
};

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

function eggDivIcon() {
  return L.divIcon({
    className: "",
    html: `<div style="font-size:28px;filter:drop-shadow(0 1px 3px rgba(0,0,0,.5))">🥚</div>`,
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
  const initializedForMode = useRef<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false,
    }).setView([0, 0], 2);

    mapRef.current = map;
    layerGroupRef.current = L.layerGroup().addTo(map);

    return () => {
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
      const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      });
      tiles.addTo(map);
      baseLayerRef.current = tiles;
      map.setMaxBounds(undefined as unknown as L.LatLngBounds);
    }
  }, [settings.mapMode, settings.staticImageUrl, settings.boundsNorthLat, settings.boundsSouthLat, settings.boundsEastLng, settings.boundsWestLng]);

  // Draw team + egg markers, refreshed whenever data changes
  const fittedOnce = useRef(false);
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
      const marker = L.marker([egg.lat, egg.lng], { icon: eggDivIcon() }).addTo(layerGroup);
      const popupHtml = `
        <div style="max-width:200px">
          <strong>${egg.title}</strong>
          ${egg.hintPhotoUrl ? `<img src="${egg.hintPhotoUrl}" style="width:100%;border-radius:8px;margin-top:6px" />` : ""}
        </div>`;
      marker.bindPopup(popupHtml);
    }

    if (!fittedOnce.current && points.length > 0 && settings.mapMode === "LIVE_TILES") {
      map.fitBounds(L.latLngBounds(points).pad(0.3), { maxZoom: 17 });
      fittedOnce.current = true;
    }
  }, [teams, eggs, settings.mapMode]);

  return <div ref={containerRef} className="h-full w-full" />;
}
