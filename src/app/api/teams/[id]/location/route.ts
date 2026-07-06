import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTeam } from "@/lib/auth";

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

  await prisma.team.update({
    where: { id },
    data: { currentLat: lat, currentLng: lng, lastSeenAt: new Date() },
  });

  return NextResponse.json({ ok: true });
}
