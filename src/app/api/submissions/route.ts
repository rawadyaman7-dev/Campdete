import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const statusParam = req.nextUrl.searchParams.get("status");

  const submissions = await prisma.submission.findMany({
    where: statusParam ? { status: statusParam as "pending" | "approved" | "rejected" } : undefined,
    orderBy: { submittedAt: "desc" },
    include: {
      team: { select: { name: true, color: true } },
      challenge: { select: { title: true, points: true } },
    },
  });

  return NextResponse.json({ submissions });
}
