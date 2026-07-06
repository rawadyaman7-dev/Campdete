import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!verifyToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const teams = await prisma.team.findMany({
    select: {
      id: true,
      name: true,
      color: true,
      currentLat: true,
      currentLng: true,
      lastSeenAt: true,
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json({ teams });
}
