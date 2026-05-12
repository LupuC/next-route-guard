# next-route-guard — Project Spec & Build Checklist

> A TypeScript npm package for Next.js App Router with two core features:
>
> 1. Auth guard middleware (with Better Auth / next-auth adapter support)
> 2. Route utility toolkit (compose, cors, rate limit, validation, etc.)

---

## Package identity

- **Name:** `next-route-guard`
- **Language:** TypeScript (strict mode)
- **Runtime target:** Edge-compatible where possible; Node.js runtime fallback documented
- **Peer deps:** `next >= 13`, optional `better-auth`, optional `next-auth`, optional `zod`
- **Zero hard deps** (except `jose` for JWT verify in standalone guard mode)
- **Exports:** ESM + CJS dual build via `tsup`
- **License:** MIT

---

## Repo structure to create

```
next-route-guard/
├── src/
│   ├── index.ts                  # barrel export of everything
│   ├── guard/
│   │   ├── createGuard.ts        # middleware factory
│   │   ├── withGuard.ts          # route handler wrapper
│   │   ├── requireAuth.ts        # session reader / 401 thrower
│   │   └── adapters/
│   │       ├── betterAuth.ts     # better-auth adapter
│   │       ├── nextAuth.ts       # next-auth adapter
│   │       └── jose.ts           # raw JWT adapter (default)
│   ├── compose/
│   │   └── compose.ts            # middleware chain
│   ├── middleware/
│   │   ├── cors.ts
│   │   ├── rateLimit.ts
│   │   ├── methodGuard.ts
│   │   ├── timeout.ts
│   │   └── withLogging.ts
│   ├── response/
│   │   ├── jsonOk.ts
│   │   └── jsonError.ts
│   └── utils/
│       ├── getClientIp.ts
│       ├── parseJson.ts
│       ├── requireHeader.ts
│       └── validateBody.ts
├── tests/
│   ├── guard.test.ts
│   ├── compose.test.ts
│   ├── middleware.test.ts
│   └── utils.test.ts
├── examples/
│   ├── with-better-auth/
│   └── with-jose/
├── package.json
├── tsconfig.json
├── tsup.config.ts
├── vitest.config.ts
└── README.md
```

---

## Step 1 — Repo & tooling setup

- `mkdir next-route-guard && cd next-route-guard && git init`
- `pnpm init`
- Install dev deps: `typescript`, `tsup`, `vitest`, `@types/node`
- Install runtime dep: `jose` (Edge-compatible JWT)
- Create `tsconfig.json` — target `ES2020`, `moduleResolution: bundler`, `strict: true`
- Create `tsup.config.ts` — dual ESM+CJS output, `.d.ts` generation, entry `src/index.ts`
- Create `vitest.config.ts`
- Add scripts to `package.json`: `build`, `test`, `test:watch`, `lint`
- Set `exports` field in `package.json` for ESM/CJS dual export
- Create `.gitignore`, `LICENSE` (MIT)

---

## Step 2 — Feature 1: Auth guard

### 2a. `createGuard(config)` — middleware factory

Config shape:

```ts
{
  adapter: 'jose' | 'better-auth' | 'next-auth' | CustomAdapter
  secret?: string                        // required for jose adapter
  protect: string[]                      // glob patterns, e.g. '/dashboard/:path*'
  public?: string[]                      // explicit allow-list, skip auth check
  redirectTo: string                     // where to send unauthenticated users
  unauthorizedTo?: string                // where to send wrong-role users (default: 403)
  roles?: Record<string, string[]>       // path pattern -> required roles
}
```

Behavior:

- Match incoming `request.nextUrl.pathname` against `public[]` first — if match, `NextResponse.next()`
- Match against `protect[]` — if no match, `NextResponse.next()`
- Run adapter to get session/token
- If no session → `NextResponse.redirect(redirectTo)`
- If `roles` defined for path → check role on session → redirect to `unauthorizedTo` or 403
- Export `config = { matcher }` derived from `protect[]` patterns for Next.js

### 2b. `withGuard(handler)` — API route wrapper

- Same config as `createGuard`, applied to a single `route.ts` handler
- Returns 401 JSON (not redirect) when unauthenticated — it's an API, not a page

### 2c. Adapters

`**jose` adapter (default)**

- Read cookie name from config (default: `token`) or `Authorization: Bearer` header
- Use `jose.jwtVerify()` with the provided secret
- Return decoded payload as session object
- Must work on Edge runtime — no Node.js APIs

`**better-auth` adapter**

- Import `getSessionCookie` from `better-auth/cookies` (peer dep, optional import)
- In middleware (Edge): cookie existence check only — fast, optimistic
- In `withGuard` (Node runtime): call `auth.api.getSession({ headers })` for full validation
- Document the distinction clearly

`**next-auth` adapter**

- In middleware: use `getToken` from `next-auth/jwt`
- In `withGuard`: use `getServerSession`
- Accept `authOptions` in config for v4, or use exported `auth()` for v5

### 2d. `requireAuth(req)` — glue function

- Reads session using whichever adapter was configured via `createGuard`
- Returns session object if valid
- Throws a `Response` (401 JSON) if not — `compose` will catch it automatically

---

## Step 3 — Feature 2: Route utilities

### 3a. `compose(...middlewares)`

- Accepts any number of async functions with signature `(req: NextRequest) => Response | void | Promise<Response | void>`
- Runs them in order left to right
- If any function returns a `Response` instance → stop chain, return that response
- If all pass → run the final handler
- Must handle both sync and async functions
- Catches thrown `Response` objects (so `requireAuth` throw works inside compose)

```ts
export const POST = compose(
  cors({ origin: 'https://example.com' }),
  rateLimit({ limit: 20, window: '1m' }),
  async (req) => { ... }
)
```

### 3b. `cors(options)`

Options: `origin`, `methods`, `allowedHeaders`, `credentials`, `maxAge`

- Handle `OPTIONS` preflight — return 204 with correct headers
- Add CORS headers to all passing responses
- Support `origin: '*'` | `string` | `string[]` | `(origin: string) => boolean`
- Default methods: `GET, POST, PUT, DELETE, OPTIONS`

### 3c. `rateLimit(options)`

Options: `limit`, `window` (`'30s'` | `'1m'` | `'5m'` | `'1h'`), `keyFn?`, `store?`

- Default key: client IP via `getClientIp`
- Default store: in-memory `Map` (document serverless limitation)
- `store` interface: `{ get(key): number | null, set(key, count, ttlMs): void }` — Upstash/Redis can implement this
- Returns 429 with `Retry-After` header on limit exceeded
- Parse `window` string to ms internally

### 3d. `methodGuard(methods: string[])`

- Returns 405 with `Allow: GET, POST` header if method not in list
- Case-insensitive match

### 3e. `jsonOk(data, status?)`

- `Response.json(data, { status: status ?? 200 })`
- Sets `Content-Type: application/json`

### 3f. `jsonError(message, status?, details?)`

- Returns `Response.json({ error: message, status, details }, { status })`
- Default status: 500
- `details` is optional, useful for validation field errors

### 3g. `getClientIp(req)`

- Read in order: `x-forwarded-for` (first IP), `x-real-ip`, `cf-connecting-ip`, fallback to `''`
- Sanitize — return only the first clean IP from comma-separated list

### 3h. `parseJson(req)`

- `await req.json()` wrapped in try/catch
- Returns parsed object or `null` on failure — never throws
- Optionally accept a type param: `parseJson<MyType>(req)`

### 3i. `requireHeader(req, headerName)`

- Returns header value if present
- Throws `jsonError('Missing header: x-api-key', 400)` if absent
- Special case: if header name is `authorization` → throw 401 instead of 400

### 3j. `validateBody(schema)`

- Accept any object with `.safeParse(data)` returning `{ success, data, error }` — Zod, Valibot, Arktype all compatible
- Returns a compose-compatible middleware
- On fail: returns `jsonError('Validation failed', 400, formattedFieldErrors)`
- On pass: attaches parsed data to `req` via a WeakMap (don't mutate the request object)
- Export `getParsedBody<T>(req): T` to retrieve it inside the handler

### 3k. `timeout(ms)`

- Wraps next handler in `Promise.race([handler(req), sleep(ms)])`
- Returns 408 `jsonError('Request timeout')` if sleep wins
- Useful for edge function time limits

### 3l. `withLogging(fn, logger?)`

- Wraps a handler, records start time
- After response: logs `method`, `pathname`, `status`, `duration ms`
- Default logger: `console.log` — accept custom `(entry) => void` for pino/winston etc.

---

## Step 4 — Tests

- `guard.test.ts` — mock `NextRequest`, test path matching, redirect logic, role checks for each adapter
- `compose.test.ts` — chain short-circuits on Response, async handlers, thrown Response caught correctly
- `middleware.test.ts` — cors headers, rate limit counter + reset, 405 on wrong method, 429 on exceeded
- `utils.test.ts` — IP parsing edge cases, parseJson null on bad input, validateBody pass/fail, requireHeader 400 vs 401

Use `vitest` + plain `Request`/`Response` globals (available in Node 18+), no mocking framework needed.

---

## Step 5 — README

Sections to write:

- Install
- Quick start (30-second example using `compose`)
- Feature 1: Auth guard — `createGuard` config table, adapter examples (jose, better-auth, next-auth)
- Feature 2: Route utilities — each function with a one-liner example
- Combining both features (the full `compose` + `requireAuth` example)
- Rate limit store adapters (Upstash example snippet)
- TypeScript types reference
- Serverless / Edge notes (what works on Edge, what needs Node runtime)

---

## Step 6 — Publish

- Bump version to `0.1.0`
- `pnpm build` — verify `dist/` has ESM + CJS + `.d.ts`
- `pnpm test` — all green
- `npm publish --access public`
- Create GitHub repo, push, add topics: `nextjs`, `middleware`, `auth`, `typescript`
- Open issues for v0.2 backlog: Redis store adapter, Upstash preset, Pages Router support

---

## Decisions log (for context)


| Decision                               | Reason                                                          |
| -------------------------------------- | --------------------------------------------------------------- |
| `jose` not `jsonwebtoken`              | Edge runtime compatible, no Node crypto                         |
| `safeParse` interface for validateBody | Works with Zod, Valibot, Arktype — no hard dep                  |
| In-memory rate limit default           | Simpler to ship; store interface allows Redis later             |
| Thrown `Response` in requireAuth       | Composes cleanly — compose catches it without extra boilerplate |
| Dual ESM+CJS build                     | Next.js projects vary; CJS still common in Pages Router         |
| No UI components                       | Stays out of scope — this is server/middleware only             |


