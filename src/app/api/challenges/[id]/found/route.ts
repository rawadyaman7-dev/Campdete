import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTeam } from "@/lib/auth";
import { distanceMeters, EGG_CLAIM_RADIUS_M } from "@/lib/geo";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const team = requireTeam(req);
  if (!team) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: challengeId } = await params;
  const { lat, lng } = await req.json();

  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }

  if (challenge.status === "collected") {
    return NextResponse.json({ error: "This egg has already been collected" }, { status: 409 });
  }

  const approvedSubmission = await prisma.submission.findFirst({
    where: { challengeId, teamId: team.teamId, status: "approved" },
  });

  if (!approvedSubmission) {
    return NextResponse.json({ error: "This egg hasn't been unlocked for your team yet" }, { status: 403 });
  }

  const pendingClaim = await prisma.eggClaim.findFirst({
    where: { challengeId, teamId: team.teamId, confirmedByAdmin: false, denied: false },
  });

  if (pendingClaim) {
    return NextResponse.json({ error: "Your claim for this egg is already awaiting admin confirmation" }, { status: 409 });
  }

  let withinRange = false;
  if (typeof lat === "number" && typeof lng === "number") {
    withinRange = distanceMeters(lat, lng, challenge.eggLat, challenge.eggLng) <= EGG_CLAIM_RADIUS_M;
  }

  const claim = await prisma.eggClaim.create({
    data: {
      challengeId,
      teamId: team.teamId,
      claimLat: typeof lat === "number" ? lat : null,
      claimLng: typeof lng === "number" ? lng : null,
      withinRange,
    },
  });

  return NextResponse.json({ claim, withinRange });
}
