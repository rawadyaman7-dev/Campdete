import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";

const SECRET = process.env.SESSION_SECRET ?? "dev-secret-change-me";

export type TeamTokenPayload = { role: "team"; teamId: string; teamName: string };
export type AdminTokenPayload = { role: "admin" };
export type TokenPayload = TeamTokenPayload | AdminTokenPayload;

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: "30d" });
}

function getBearerToken(req: NextRequest): string | null {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

export function verifyToken(req: NextRequest): TokenPayload | null {
  const token = getBearerToken(req);
  if (!token) return null;
  try {
    return jwt.verify(token, SECRET) as TokenPayload;
  } catch {
    return null;
  }
}

export function requireTeam(req: NextRequest): TeamTokenPayload | null {
  const payload = verifyToken(req);
  if (!payload || payload.role !== "team") return null;
  return payload;
}

export function requireAdmin(req: NextRequest): AdminTokenPayload | null {
  const payload = verifyToken(req);
  if (!payload || payload.role !== "admin") return null;
  return payload;
}
