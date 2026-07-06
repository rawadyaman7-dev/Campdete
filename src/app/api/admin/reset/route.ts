import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Wipes all game PROGRESS (submissions, egg claims, distance walked, GPS
// positions, and re-opens every challenge) while keeping the camp's actual
// setup intact: team roster/PINs/colors and the challenge list itself are
// untouched. Meant for resetting after test runs, right before handing the
// game to the real patrols.
export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await prisma.$transaction([
    prisma.eggClaim.deleteMany({}),
    prisma.submission.deleteMany({}),
    prisma.challenge.updateMany({ data: { status: "open" } }),
    prisma.team.updateMany({
      data: { currentLat: null, currentLng: null, lastSeenAt: null, totalDistanceMeters: 0 },
    }),
  ]);

  return NextResponse.json({ ok: true });
}
