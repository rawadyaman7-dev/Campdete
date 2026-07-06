import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyToken, requireAdmin } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { uploadPhoto } from "@/lib/storage";

export async function GET(req: NextRequest) {
  if (!verifyToken(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getSettings();
  return NextResponse.json({ settings });
}

export async function PUT(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const mapMode = formData.get("mapMode") as string | null;
  const boundsNorthLat = formData.get("boundsNorthLat");
  const boundsSouthLat = formData.get("boundsSouthLat");
  const boundsEastLng = formData.get("boundsEastLng");
  const boundsWestLng = formData.get("boundsWestLng");
  const staticImage = formData.get("staticImage") as File | null;

  await getSettings();

  const data: Record<string, unknown> = {};
  if (mapMode === "LIVE_TILES" || mapMode === "STATIC_IMAGE") data.mapMode = mapMode;
  if (boundsNorthLat !== null) data.boundsNorthLat = Number(boundsNorthLat);
  if (boundsSouthLat !== null) data.boundsSouthLat = Number(boundsSouthLat);
  if (boundsEastLng !== null) data.boundsEastLng = Number(boundsEastLng);
  if (boundsWestLng !== null) data.boundsWestLng = Number(boundsWestLng);

  if (staticImage && staticImage.size > 0) {
    const buffer = Buffer.from(await staticImage.arrayBuffer());
    data.staticImageUrl = await uploadPhoto(buffer, staticImage.type, "map");
  }

  const settings = await prisma.settings.update({ where: { id: 1 }, data });

  return NextResponse.json({ settings });
}
