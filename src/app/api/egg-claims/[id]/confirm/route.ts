import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { action } = await req.json();

  if (action !== "confirm" && action !== "deny") {
    return NextResponse.json({ error: "action must be 'confirm' or 'deny'" }, { status: 400 });
  }

  const claim = await prisma.eggClaim.findUnique({ where: { id } });
  if (!claim) {
    return NextResponse.json({ error: "Claim not found" }, { status: 404 });
  }

  if (action === "deny") {
    const updated = await prisma.eggClaim.update({ where: { id }, data: { denied: true } });
    return NextResponse.json({ claim: updated });
  }

  const [updated] = await prisma.$transaction([
    prisma.eggClaim.update({
      where: { id },
      data: { confirmedByAdmin: true, confirmedAt: new Date() },
    }),
    prisma.challenge.update({
      where: { id: claim.challengeId },
      data: { status: "collected" },
    }),
    prisma.eggClaim.updateMany({
      where: { challengeId: claim.challengeId, id: { not: id }, confirmedByAdmin: false },
      data: { denied: true },
    }),
  ]);

  return NextResponse.json({ claim: updated });
}
