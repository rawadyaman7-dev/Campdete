import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

// Undoes credit for an approved submission — for cases like a patrol being
// caught cheating on a challenge they were already given credit for.
// Resets the submission back to "rejected" (so the team can resubmit), and
// if the egg for that challenge had already been confirmed as collected by
// this same team, un-collects it (deletes the confirmed claim and reopens
// the challenge so it can be claimed again).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const submission = await prisma.submission.findUnique({ where: { id } });
  if (!submission) {
    return NextResponse.json({ error: "Submission not found" }, { status: 404 });
  }

  if (submission.status !== "approved") {
    return NextResponse.json({ error: "Only approved submissions can be revoked" }, { status: 400 });
  }

  const confirmedClaim = await prisma.eggClaim.findFirst({
    where: { challengeId: submission.challengeId, teamId: submission.teamId, confirmedByAdmin: true },
  });

  await prisma.$transaction([
    prisma.submission.update({
      where: { id },
      data: { status: "rejected", reviewedAt: new Date() },
    }),
    // Clear out any of this team's not-yet-decided claims on the same
    // challenge so they don't linger in the pending Egg Claims queue
    // referencing a submission that's no longer approved.
    prisma.eggClaim.updateMany({
      where: {
        challengeId: submission.challengeId,
        teamId: submission.teamId,
        confirmedByAdmin: false,
        denied: false,
      },
      data: { denied: true },
    }),
    ...(confirmedClaim
      ? [
          prisma.eggClaim.delete({ where: { id: confirmedClaim.id } }),
          prisma.challenge.update({ where: { id: submission.challengeId }, data: { status: "open" } }),
        ]
      : []),
  ]);

  return NextResponse.json({ ok: true, uncollected: !!confirmedClaim });
}
