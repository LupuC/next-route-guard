import type { NextMiddleware } from "next/server";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { jsonError } from "../response/jsonError.js";
import { matchRoutePattern, matchesAnyPattern } from "../utils/pathMatch.js";
import { betterAuthMiddlewareSession, betterAuthRouteSession } from "./adapters/betterAuth.js";
import { joseGetSession } from "./adapters/jose.js";
import { nextAuthMiddlewareSession, nextAuthRouteSession } from "./adapters/nextAuth.js";
import type {
  CreateGuardConfig,
  CreateGuardResult,
  CustomAdapter,
  GuardAdapterName,
  GuardRuntime,
  SessionData,
} from "./types.js";

export function sessionRoles(session: SessionData): string[] {
  const role = session.role;
  if (typeof role === "string") return [role];
  const roles = session.roles;
  if (Array.isArray(roles)) return roles.filter((x): x is string => typeof x === "string");
  return [];
}

function pickRolesForPath(
  pathname: string,
  rolesCfg: Record<string, string[]>,
): string[] | null {
  const keys = Object.keys(rolesCfg);
  const hit = keys.filter((k) => matchRoutePattern(k, pathname));
  if (hit.length === 0) return null;
  hit.sort((a, b) => b.length - a.length);
  return rolesCfg[hit[0]!] ?? null;
}

export function hasAnyRole(session: SessionData, required: string[]): boolean {
  const have = new Set(sessionRoles(session));
  return required.some((r) => have.has(r));
}

function isAdapterName(a: CreateGuardConfig["adapter"]): a is GuardAdapterName {
  return a === "jose" || a === "better-auth" || a === "next-auth";
}

export async function resolveSession(
  cfg: CreateGuardConfig,
  req: NextRequest,
  runtime: GuardRuntime,
): Promise<SessionData | null> {
  const adapter = cfg.adapter;
  if (typeof adapter === "object" && adapter !== null && "getSession" in adapter) {
    return (adapter as CustomAdapter).getSession(req, runtime);
  }
  if (!isAdapterName(adapter)) return null;

  if (adapter === "jose") {
    if (!cfg.secret) throw new Error("createGuard: `secret` is required for the `jose` adapter");
    return joseGetSession(req, cfg.secret, cfg.cookieName);
  }

  if (adapter === "better-auth") {
    if (runtime === "middleware") {
      return betterAuthMiddlewareSession(req);
    }
    return betterAuthRouteSession(req, cfg.betterAuthGetSession);
  }

  if (adapter === "next-auth") {
    if (runtime === "middleware") {
      if (!cfg.secret) {
        throw new Error("createGuard: `secret` is required for `next-auth` in middleware (JWT / getToken)");
      }
      return nextAuthMiddlewareSession(req, cfg.secret);
    }
    return nextAuthRouteSession({
      authOptions: cfg.authOptions,
      auth: cfg.auth,
    });
  }

  return null;
}

function makeRequireAuth(cfg: CreateGuardConfig): (req: NextRequest) => Promise<SessionData> {
  return async function requireAuth(req: NextRequest): Promise<SessionData> {
    const session = await resolveSession(cfg, req, "route");
    if (!session) {
      throw jsonError("Unauthorized", 401);
    }
    const pathname = req.nextUrl.pathname;
    const required = pickRolesForPath(pathname, cfg.roles ?? {});
    if (required && required.length && !hasAnyRole(session, required)) {
      throw jsonError("Forbidden", 403);
    }
    return session;
  };
}

export function createRequireAuth(cfg: CreateGuardConfig): (req: NextRequest) => Promise<SessionData> {
  return makeRequireAuth(cfg);
}

export function createGuard(cfg: CreateGuardConfig): CreateGuardResult {
  const requireAuth = makeRequireAuth(cfg);

  const middleware: NextMiddleware = async (request) => {
    const pathname = request.nextUrl.pathname;
    if (cfg.public && matchesAnyPattern(cfg.public, pathname)) {
      return NextResponse.next();
    }
    if (!matchesAnyPattern(cfg.protect, pathname)) {
      return NextResponse.next();
    }

    const session = await resolveSession(cfg, request, "middleware");
    if (!session) {
      return NextResponse.redirect(new URL(cfg.redirectTo, request.url));
    }

    const required = pickRolesForPath(pathname, cfg.roles ?? {});
    if (required && required.length) {
      if (cfg.adapter === "better-auth") {
        return NextResponse.next();
      }
      if (!hasAnyRole(session, required)) {
        if (cfg.unauthorizedTo) {
          return NextResponse.redirect(new URL(cfg.unauthorizedTo, request.url));
        }
        return new Response(JSON.stringify({ error: "Forbidden", status: 403 }), {
          status: 403,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return NextResponse.next();
  };

  return {
    middleware,
    requireAuth,
    config: { matcher: cfg.protect },
  };
}
