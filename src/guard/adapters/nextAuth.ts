import type { NextRequest } from "next/server";
import type { SessionData } from "../types.js";

export async function nextAuthMiddlewareSession(
  req: NextRequest,
  secret: string,
): Promise<SessionData | null> {
  try {
    const { getToken } = await import("next-auth/jwt");
    const token = await getToken({ req, secret });
    if (!token) return null;
    return { ...token } as SessionData;
  } catch {
    return null;
  }
}

export async function nextAuthRouteSession(options: {
  authOptions?: unknown;
  auth?: () => Promise<unknown | null>;
}): Promise<SessionData | null> {
  if (options.auth) {
    const s = await options.auth();
    if (!s) return null;
    return s as SessionData;
  }

  try {
    const nextAuth = await import("next-auth");
    const getServerSession =
      (nextAuth as { getServerSession?: (opts: unknown) => Promise<unknown | null> }).getServerSession;
    if (typeof getServerSession !== "function") return null;
    if (!options.authOptions) {
      throw new Error("next-auth: provide `authOptions` or `auth()` in guard config");
    }
    const session = await getServerSession(options.authOptions);
    if (!session) return null;
    return session as SessionData;
  } catch {
    return null;
  }
}
