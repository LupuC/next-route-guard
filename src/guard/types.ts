import type { NextRequest } from "next/server";

export type SessionData = Record<string, unknown>;

export type GuardRuntime = "middleware" | "route";

export interface CustomAdapter {
  getSession: (req: NextRequest, runtime: GuardRuntime) => Promise<SessionData | null>;
}

export type GuardAdapterName = "jose" | "better-auth" | "next-auth";

export type GuardAdapter = GuardAdapterName | CustomAdapter;

export interface CreateGuardConfig {
  adapter: GuardAdapter;
  /** Required when adapter is `'jose'`. */
  secret?: string;
  /** JWT cookie name for jose (default: `token`). */
  cookieName?: string;
  protect: string[];
  public?: string[];
  redirectTo: string;
  /** Redirect for forbidden roles; if absent, return 403 response. */
  unauthorizedTo?: string;
  roles?: Record<string, string[]>;
  /** next-auth v4 options object passed to `getToken` / `getServerSession`. */
  authOptions?: unknown;
  /**
   * next-auth v5 `auth()` — used in route handlers for `withGuard` when provided.
   */
  auth?: () => Promise<unknown | null>;
  /**
   * better-auth: in middleware only a session cookie is verified (optimistic).
   * For route / `withGuard`, provide a function that returns the full session from headers.
   */
  betterAuthGetSession?: (ctx: {
    headers: Headers;
  }) => Promise<SessionData | null>;
}

export interface WithGuardConfig extends Omit<CreateGuardConfig, "protect" | "public" | "roles" | "redirectTo"> {
  /** Unused for API JSON responses; defaults to `/`. */
  redirectTo?: string;
  /** Roles required for this API route (any match). */
  roles?: string[];
}

export interface CreateGuardResult {
  middleware: import("next/server").NextMiddleware;
  requireAuth: (req: NextRequest) => Promise<SessionData>;
  config: { matcher: string[] };
}
