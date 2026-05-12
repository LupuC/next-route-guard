import type { NextRequest } from "next/server";
import { jsonError } from "../response/jsonError.js";
import { hasAnyRole, resolveSession } from "./createGuard.js";
import type { CreateGuardConfig, WithGuardConfig } from "./types.js";

export function withGuard<T extends NextRequest = NextRequest>(
  cfg: WithGuardConfig,
  handler: (req: T) => Response | Promise<Response>,
) {
  const routeCfg: CreateGuardConfig = {
    adapter: cfg.adapter,
    secret: cfg.secret,
    cookieName: cfg.cookieName,
    protect: ["/:path*"],
    public: [],
    redirectTo: cfg.redirectTo ?? "/",
    unauthorizedTo: cfg.unauthorizedTo,
    roles: {},
    authOptions: cfg.authOptions,
    auth: cfg.auth,
    betterAuthGetSession: cfg.betterAuthGetSession,
  };

  return async (req: T): Promise<Response> => {
    const session = await resolveSession(routeCfg, req, "route");
    if (!session) {
      return jsonError("Unauthorized", 401);
    }
    if (cfg.roles?.length && !hasAnyRole(session, cfg.roles)) {
      return jsonError("Forbidden", 403);
    }
    return handler(req);
  };
}
