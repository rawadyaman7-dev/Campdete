import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { uploadPhoto } from "@/lib/storage";

// Distance-unlock challenges don't have a real proof photo — this marks
// the auto-created submission so it's obvious in the data if anyone looks.
const AUTO_UNLOCK_MARKER = "auto:distance-walked";

async function autoUnlockDistanceChallenges(teamId: string) {
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { totalDistanceMeters: true } });
  if (!team) return;

  const candidates = await prisma.challenge.findMany({
    where: { status: "open", unlockType: "DISTANCE_WALKED", requiredDistanceMeters: { not: null } },
    include: { submissions: { where: { teamId }, select: { id: true } } },
  });

  const toUnlock = candidates.filter(
    (c) => c.submissions.length === 0 && team.totalDistanceMeters >= (c.requiredDistanceMeters ?? Infinity)
  );

  if (toUnlock.length === 0) return;

  await prisma.submission.createMany({
    data: toUnlock.map((c) => ({
      challengeId: c.id,
      teamId,
      proofPhotoUrls: [AUTO_UNLOCK_MARKER],
      status: "approved" as const,
      reviewedAt: new Date(),
    })),
  });
}

export async function GET(req: NextRequest) {
  const auth = verifyToken(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (auth.role === "team") {
    await autoUnlockDistanceChallenges(auth.teamId);
  }

  const teamDistance =
    auth.role === "team"
      ? (await prisma.team.findUnique({ where: { id: auth.teamId }, select: { totalDistanceMeters: true } }))
          ?.totalDistanceMeters ?? 0
      : 0;

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
        unlockType: c.unlockType,
        requiredDistanceMeters: c.requiredDistanceMeters,
        collectedBy: collectedClaim ? { teamName: collectedClaim.team.name, at: collectedClaim.confirmedAt } : null,
      };
    }

    const mySubmission = "submissions" in c ? c.submissions[0] : undefined;
    let status: "collected" | "pending" | "racing" | "rejected" | "open" = "open";

    if (c.status === "collected") status = "collected";
    else if (mySubmission?.status === "pending") status = "pending";
    else if (mySubmission?.status === "approved") status = "racing";
    else if (mySubmission?.status === "rejected") status = "rejected";

    const distanceProgress =
      c.unlockType === "DISTANCE_WALKED" && status === "open" && c.requiredDistanceMeters != null
        ? { walkedMeters: teamDistance, requiredMeters: c.requiredDistanceMeters }
        : null;

    return {
      id: c.id,
      title: c.title,
      description: c.description,
      points: c.points,
      status,
      unlockType: c.unlockType,
      distanceProgress,
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
  const unlockTypeRaw = formData.get("unlockType") as string | null;
  const requiredDistanceKmRaw = formData.get("requiredDistanceKm");

  if (!title || !description || Number.isNaN(points) || Number.isNaN(eggLat) || Number.isNaN(eggLng)) {
    return NextResponse.json({ error: "Missing or invalid fields" }, { status: 400 });
  }

  const unlockType = unlockTypeRaw === "DISTANCE_WALKED" ? "DISTANCE_WALKED" : "PHOTO_SUBMISSION";
  const requiredDistanceMeters =
    unlockType === "DISTANCE_WALKED" && requiredDistanceKmRaw
      ? Math.round(Number(requiredDistanceKmRaw) * 1000)
      : null;

  if (unlockType === "DISTANCE_WALKED" && (!requiredDistanceMeters || Number.isNaN(requiredDistanceMeters))) {
    return NextResponse.json({ error: "Required distance (km) is needed for distance-unlock challenges" }, { status: 400 });
  }

  let eggHintPhotoUrl: string | undefined;
  if (hintPhoto && hintPhoto.size > 0) {
    const buffer = Buffer.from(await hintPhoto.arrayBuffer());
    eggHintPhotoUrl = await uploadPhoto(buffer, hintPhoto.type, "hints");
  }

  const challenge = await prisma.challenge.create({
    data: { title, description, points, eggLat, eggLng, eggHintPhotoUrl, unlockType, requiredDistanceMeters },
  });

  return NextResponse.json({ challenge });
}
