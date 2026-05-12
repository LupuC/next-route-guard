import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import type { SessionData } from "../types.js";

export async function joseGetSession(
  req: NextRequest,
  secret: string,
  cookieName: string = "token",
): Promise<SessionData | null> {
  const header = req.headers.get("authorization");
  let token: string | null = null;
  if (header && /^Bearer\s+/i.test(header)) {
    token = header.replace(/^Bearer\s+/i, "").trim();
  }
  if (!token) {
    token = req.cookies.get(cookieName)?.value ?? null;
  }
  if (!token) return null;

  try {
    const key = new TextEncoder().encode(secret);
    const { payload } = await jwtVerify(token, key);
    return { ...payload } as SessionData;
  } catch {
    return null;
  }
}
