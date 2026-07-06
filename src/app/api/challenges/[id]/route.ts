import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken } from "@/lib/auth";
import { uploadPhoto } from "@/lib/storage";

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = verifyToken(req);
  if (!auth || auth.role !== "admin") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const formData = await req.formData();

  const title = formData.get("title") as string | null;
  const description = formData.get("description") as string | null;
  const pointsRaw = formData.get("points");
  const eggLatRaw = formData.get("eggLat");
  const eggLngRaw = formData.get("eggLng");
  const hintPhoto = formData.get("hintPhoto") as File | null;

  const data: Record<string, unknown> = {};
  if (title) data.title = title;
  if (description) data.description = description;
  if (pointsRaw !== null) data.points = Number(pointsRaw);
  if (eggLatRaw !== null) data.eggLat = Number(eggLatRaw);
  if (eggLngRaw !== null) data.eggLng = Number(eggLngRaw);

  if (hintPhoto && hintPhoto.size > 0) {
    const buffer = Buffer.from(await hintPhoto.arrayBuffer());
    data.eggHintPhotoUrl = await uploadPhoto(buffer, hintPhoto.type, "hints");
  }

  const challenge = await prisma.challenge.update({ where: { id }, data });

  return NextResponse.json({ challenge });
}
