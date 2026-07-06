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
  const photos = formData.getAll("photo").filter((f): f is File => f instanceof File && f.size > 0);

  if (photos.length === 0) {
    return NextResponse.json({ error: "At least one proof photo or video is required" }, { status: 400 });
  }

  const proofPhotoUrls = await Promise.all(
    photos.map(async (photo) => {
      const buffer = Buffer.from(await photo.arrayBuffer());
      return uploadPhoto(buffer, photo.type, "submissions");
    })
  );

  const submission = await prisma.submission.create({
    data: { challengeId, teamId: team.teamId, proofPhotoUrls },
  });

  return NextResponse.json({ submission });
}
