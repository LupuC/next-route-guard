# next-route-guard

TypeScript helpers for the **Next.js App Router**: auth-aware middleware (`createGuard`), API route protection (`withGuard`), and a small **compose** toolkit (CORS, rate limiting, validation, and more). Works on the **Edge** for JWT (`jose`), with documented behavior for **Better Auth** and **NextAuth**.

## Install

```bash
pnpm add next-route-guard jose next
```

Optional peers (install only what you use): `better-auth`, `next-auth`, `zod`.

## Quick start (`compose`)

```ts
// app/api/hello/route.ts
import { NextRequest } from "next/server";
import { compose, cors, jsonOk, rateLimit } from "next-route-guard";

export const POST = compose(
  cors({ origin: "https://example.com" }),
  rateLimit({ limit: 20, window: "1m" }),
  async (req: NextRequest) => jsonOk({ message: "ok", path: req.nextUrl.pathname }),
);
```

## Feature 1 — Auth guard

### `createGuard(config)`

| Field | Meaning |
|--------|--------|
| `adapter` | `'jose'` \| `'better-auth'` \| `'next-auth'` \| `{ getSession }` |
| `secret` | Required for `jose`; required for `next-auth` **middleware** (`getToken`). |
| `cookieName` | JWT cookie for `jose` (default `token`). |
| `protect` | Path patterns (Next-style, e.g. `/app/:path*`) requiring auth. |
| `public` | Explicit allow-list (checked before `protect`). |
| `redirectTo` | Login URL for unauthenticated **HTML** traffic. |
| `unauthorizedTo` | Redirect when role check fails; else `403` JSON. |
| `roles` | Map of path pattern → allowed roles (see below). |
| `betterAuthGetSession` | `(ctx) => session` for **`withGuard` / route** validation with Better Auth. |
| `authOptions` / `auth` | NextAuth v4 options or v5 `auth()` for **routes**. |

Returns `{ middleware, requireAuth, config: { matcher } }`.

> **`matcher` must be a static literal.** Next.js statically analyzes the `config` export in `middleware.ts` and ignores dynamic values, so `export const config = guard.config` will **not** scope the middleware. Write the matcher yourself: `export const config = { matcher: ["/app/:path*"] }`. The returned `config` is only a convenience for copying/logging.

- **Middleware:** unauthenticated users are **redirected** to `redirectTo` on protected paths.
- **`requireAuth` / `createRequireAuth`:** throws a **`Response`** (`401` / `403` JSON) so it works inside `compose` without extra branching.
- **Better Auth in middleware:** **cookie presence only** (fast, optimistic). Full validation happens in **`withGuard`** or any route helper that uses `betterAuthGetSession`.
- **`roles` in middleware with Better Auth:** role checks are **skipped** in middleware (no full session on the edge); use **route-level** checks or another adapter for strict role gating in middleware.

### `withGuard(config, handler)`

Same adapters as `createGuard`, but for a **single** route handler. Unauthenticated → **`401` JSON** (no redirect). Optional `roles: string[]` for that route.

### Adapters (short)

- **`jose`:** reads `Authorization: Bearer` or cookie; verifies with `jose` (Edge-safe).
- **`better-auth`:** middleware = session cookie; routes = your `betterAuthGetSession({ headers })`.
- **`next-auth`:** middleware = `getToken` + `secret`; routes = `auth()` or `getServerSession(authOptions)`.

## Feature 2 — Route utilities

| Export | One-liner |
|--------|-----------|
| `compose(...mw, handler)` | Runs middlewares left→right; first `Response` wins; applies **CORS** to final response when `cors()` ran. |
| `cors(opts)` | Preflight `204`; echoes `Origin` / methods / headers. |
| `rateLimit({ limit, window, keyFn?, store? })` | In-memory **Map** by default; returns **`429`** + **`Retry-After`**. |
| `methodGuard(methods)` | **`405`** + `Allow` when method not listed. |
| `jsonOk(data, status?)` | JSON `200` (or given status). |
| `jsonError(message, status?, details?)` | JSON error body; default **500**. |
| `timeout(ms)` | Races the **final** handler (via WeakMap + `compose`); **`408`** on timeout. |
| `withLogging(handler, logger?)` | Logs method, pathname, status, duration. |
| `getClientIp(req)` | `x-forwarded-for` → `x-real-ip` → `cf-connecting-ip`. |
| `parseJson(req)` | `await req.json()`; **`null`** on failure. |
| `requireHeader(req, name)` | Missing header → **400** JSON (**401** if name is `authorization`). |
| `validateBody(schema)` | Any `.safeParse()` schema (Zod, etc.); use `getParsedBody(req)`. |

### Rate limit `store`

For Redis / Upstash, implement `increment(key, ttlMs)`: atomically bump the counter and return the new count, applying the TTL **only when the key is created** (fixed window — e.g. Redis `INCR` + `PEXPIRE ... NX`). Sync or async both work. The default store is in-memory (per isolate, not durable on serverless).

```ts
rateLimit({
  limit: 100,
  window: "1m",
  store: {
    increment: async (key, ttlMs) => {
      const count = await redis.incr(key);
      if (count === 1) await redis.pexpire(key, ttlMs);
      return count;
    },
  },
});
```

A `{ get(key), set(key, count, ttlMs) }` store is also accepted (sync or async), but it is not atomic and its window resets on every write — prefer `increment`.

## Combining guard + compose

```ts
const { requireAuth } = createGuard({
  adapter: "jose",
  secret: process.env.AUTH_SECRET!,
  protect: ["/api/:path*"],
  public: [],
  redirectTo: "/login",
});

export const GET = compose(
  rateLimit({ limit: 30, window: "1m" }),
  async (req) => {
    await requireAuth(req);
    return jsonOk({ ok: true });
  },
);
```

## TypeScript

Types ship with the package (`dist/index.d.ts`). Build is **ESM + CJS** (`tsup`).

## Edge vs Node

| Area | Edge | Notes |
|------|------|--------|
| `jose`, `compose`, CORS, rate limit (memory), `methodGuard`, `timeout` | Yes | Memory rate limit is per isolate. |
| Better Auth **middleware** | Cookie check only | Full session on **Node** routes via `betterAuthGetSession`. |
| NextAuth **`getServerSession` in `withGuard`** | Typically **Node** route runtime | Prefer `auth()` (v5) where supported. |

See `about.md` in the repo for the full checklist and design notes.

## License

MIT — see `LICENSE`.
