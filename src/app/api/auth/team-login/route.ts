import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signToken } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { teamName, pin } = await req.json();

  if (!teamName || !pin) {
    return NextResponse.json({ error: "Team name and PIN are required" }, { status: 400 });
  }

  const team = await prisma.team.findUnique({ where: { name: teamName } });

  if (!team || team.pin !== pin) {
    return NextResponse.json({ error: "Invalid team name or PIN" }, { status: 401 });
  }

  const token = signToken({ role: "team", teamId: team.id, teamName: team.name });

  return NextResponse.json({
    token,
    team: { id: team.id, name: team.name, color: team.color },
  });
}
