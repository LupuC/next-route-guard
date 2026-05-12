import type { NextRequest } from "next/server";
import type { SessionData } from "../types.js";

export async function betterAuthMiddlewareSession(
  req: NextRequest,
): Promise<SessionData | null> {
  try {
    const mod = await import("better-auth/cookies");
    const getSessionCookie = (mod as { getSessionCookie?: (request: NextRequest) => string | null })
      .getSessionCookie;
    if (typeof getSessionCookie === "function") {
      const v = getSessionCookie(req);
      if (v) {
        return { optimistic: true, hasSessionCookie: true } satisfies SessionData;
      }
    }
  } catch {
    // optional peer not installed or API mismatch
  }
  return null;
}

export async function betterAuthRouteSession(
  req: NextRequest,
  getter?: (ctx: { headers: Headers }) => Promise<SessionData | null>,
): Promise<SessionData | null> {
  if (!getter) {
    throw new Error(
      "better-auth: provide `betterAuthGetSession` in guard config for route-level validation",
    );
  }
  return getter({ headers: req.headers });
}
