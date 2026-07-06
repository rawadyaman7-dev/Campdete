import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { uploadPhoto } from "@/lib/storage";

export async function GET(req: NextRequest) {
  const auth = verifyToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const challenges = await prisma.challenge.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      submissions: auth.role === "team" ? { where: { teamId: auth.teamId }, orderBy: { submittedAt: "desc" } } : false,
      eggClaims: {
        where: { confirmedByAdmin: true, denied: false },
        include: { team: { select: { name: true } } },
      },
    },
  });

  const myPendingClaimChallengeIds =
    auth.role === "team"
      ? new Set(
          (
            await prisma.eggClaim.findMany({
              where: { teamId: auth.teamId, confirmedByAdmin: false, denied: false },
              select: { challengeId: true },
            })
          ).map((c) => c.challengeId)
        )
      : new Set<string>();

  const result = challenges.map((c) => {
    const collectedClaim = c.eggClaims[0];

    if (auth.role === "admin") {
      return {
        id: c.id,
        title: c.title,
        description: c.description,
        points: c.points,
        status: c.status,
        eggLat: c.eggLat,
        eggLng: c.eggLng,
        eggHintPhotoUrl: c.eggHintPhotoUrl,
        collectedBy: collectedClaim ? { teamName: collectedClaim.team.name, at: collectedClaim.confirmedAt } : null,
      };
    }

    const mySubmission = "submissions" in c ? c.submissions[0] : undefined;
    let status: "collected" | "pending" | "racing" | "rejected" | "open" = "open";

    if (c.status === "collected") status = "collected";
    else if (mySubmission?.status === "pending") status = "pending";
    else if (mySubmission?.status === "approved") status = "racing";
    else if (mySubmission?.status === "rejected") status = "rejected";

    return {
      id: c.id,
      title: c.title,
      description: c.description,
      points: c.points,
      status,
      collectedBy: collectedClaim ? { teamName: collectedClaim.team.name, at: collectedClaim.confirmedAt } : null,
      egg: status === "racing" ? { lat: c.eggLat, lng: c.eggLng, hintPhotoUrl: c.eggHintPhotoUrl } : null,
      myClaimPending: myPendingClaimChallengeIds.has(c.id),
    };
  });

  return NextResponse.json({ challenges: result });
}

export async function POST(req: NextRequest) {
  const auth = verifyToken(req);
  if (!auth || auth.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const title = formData.get("title") as string;
  const description = formData.get("description") as string;
  const points = Number(formData.get("points"));
  const eggLat = Number(formData.get("eggLat"));
  const eggLng = Number(formData.get("eggLng"));
  const hintPhoto = formData.get("hintPhoto") as File | null;

  if (!title || !description || Number.isNaN(points) || Number.isNaN(eggLat) || Number.isNaN(eggLng)) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }

  let eggHintPhotoUrl: string | undefined;
  if (hintPhoto && hintPhoto.size > 0) {
    const buffer = Buffer.from(await hintPhoto.arrayBuffer());
    eggHintPhotoUrl = await uploadPhoto(buffer, hintPhoto.type, "hints");
  }

  const challenge = await prisma.challenge.create({
    data: { title, description, points, eggLat, eggLng, eggHintPhotoUrl },
  });

  return NextResponse.json({ challenge });
}
