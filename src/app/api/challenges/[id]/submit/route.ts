import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireTeam } from "@/lib/auth";
import { uploadPhoto } from "@/lib/storage";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const team = requireTeam(req);
  if (!team) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: challengeId } = await params;

  const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
  if (!challenge) {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }

  const existing = await prisma.submission.findFirst({
    where: { challengeId, teamId: team.teamId },
    orderBy: { submittedAt: "desc" },
  });

  if (existing && existing.status !== "rejected") {
    return NextResponse.json({ error: "A submission is already pending or approved for this challenge" }, { status: 409 });
  }

  const formData = await req.formData();
  const photo = formData.get("photo") as File | null;

  if (!photo || photo.size === 0) {
    return NextResponse.json({ error: "Proof photo is required" }, { status: 400 });
  }

  const buffer = Buffer.from(await photo.arrayBuffer());
  const proofPhotoUrl = await uploadPhoto(buffer, photo.type, "submissions");

  const submission = await prisma.submission.create({
    data: { challengeId, teamId: team.teamId, proofPhotoUrl },
  });

  return NextResponse.json({ submission });
}
