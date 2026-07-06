import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const pendingOnly = req.nextUrl.searchParams.get("pending") === "true";

  const claims = await prisma.eggClaim.findMany({
    where: pendingOnly ? { confirmedByAdmin: false, denied: false } : undefined,
    orderBy: { claimedAt: "desc" },
    include: {
      team: { select: { name: true, color: true } },
      challenge: { select: { title: true, points: true, eggLat: true, eggLng: true } },
    },
  });

  return NextResponse.json({ claims });
}
