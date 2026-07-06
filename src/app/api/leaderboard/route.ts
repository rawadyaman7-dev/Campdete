import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!verifyToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teams = await prisma.team.findMany({
    select: { id: true, name: true, color: true },
    orderBy: { name: "asc" },
  });

  const confirmedClaims = await prisma.eggClaim.findMany({
    where: { confirmedByAdmin: true },
    include: {
      team: { select: { name: true } },
      challenge: { select: { title: true, points: true } },
    },
    orderBy: { confirmedAt: "desc" },
  });

  const totals = new Map<string, number>();
  for (const team of teams) totals.set(team.id, 0);
  for (const claim of confirmedClaims) {
    totals.set(claim.teamId, (totals.get(claim.teamId) ?? 0) + claim.challenge.points);
  }

  const leaderboard = teams
    .map((team) => ({ ...team, points: totals.get(team.id) ?? 0 }))
    .sort((a, b) => b.points - a.points);

  const approvedSubmissions = await prisma.submission.findMany({
    where: { status: "approved" },
    include: {
      team: { select: { name: true } },
      challenge: { select: { title: true, points: true } },
    },
    orderBy: { submittedAt: "desc" },
  });

  const collectedByKey = new Map(confirmedClaims.map((c) => [`${c.challengeId}:${c.teamId}`, c]));

  const history = approvedSubmissions.map((sub) => {
    const claim = collectedByKey.get(`${sub.challengeId}:${sub.teamId}`);
    return {
      id: sub.id,
      challengeTitle: sub.challenge.title,
      teamName: sub.team.name,
      points: sub.challenge.points,
      submittedAt: sub.submittedAt,
      approvedAt: sub.reviewedAt,
      collectedAt: claim?.confirmedAt ?? null,
    };
  });

  return NextResponse.json({ leaderboard, history });
}
