import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTeam } from "@/lib/auth";
import { distanceMeters } from "@/lib/geo";

// Below this, treat movement as GPS jitter (phones can drift several
// meters even standing still) rather than actual walking.
const MIN_MOVEMENT_METERS = 8;
// Above this between two consecutive pings (~15-20s apart), treat it as a
// GPS glitch/teleport rather than real movement, so a single bad reading
// can't inflate a team's total distance.
const MAX_PLAUSIBLE_METERS_PER_PING = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const team = requireTeam(req);
  const { id } = await params;

  if (!team || team.teamId !== id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { lat, lng } = await req.json();

  if (typeof lat !== "number" || typeof lng !== "number") {
    return NextResponse.json({ error: "lat and lng must be numbers" }, { status: 400 });
  }

  const existing = await prisma.team.findUnique({
    where: { id },
    select: { currentLat: true, currentLng: true, totalDistanceMeters: true },
  });

  let addedDistance = 0;
  if (existing?.currentLat != null && existing.currentLng != null) {
    const delta = distanceMeters(existing.currentLat, existing.currentLng, lat, lng);
    if (delta >= MIN_MOVEMENT_METERS && delta <= MAX_PLAUSIBLE_METERS_PER_PING) {
      addedDistance = delta;
    }
  }

  await prisma.team.update({
    where: { id },
    data: {
      currentLat: lat,
      currentLng: lng,
      lastSeenAt: new Date(),
      totalDistanceMeters: (existing?.totalDistanceMeters ?? 0) + addedDistance,
    },
  });

  return NextResponse.json({ ok: true });
}
