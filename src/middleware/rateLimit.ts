import type { NextRequest } from "next/server";
import { jsonError } from "../response/jsonError.js";
import { getClientIp } from "../utils/getClientIp.js";

export type RateLimitWindow = "30s" | "1m" | "5m" | "1h";

export interface RateLimitStore {
  /**
   * Atomically increment the counter for `key` and return the new count.
   * The window TTL must be applied only when the key is created, never
   * refreshed on subsequent increments (fixed window). Maps directly onto
   * Redis `INCR` + `PEXPIRE ... NX`. Preferred over `get`/`set`.
   */
  increment?(key: string, ttlMs: number): number | Promise<number>;
  get?(key: string): number | null | Promise<number | null>;
  set?(key: string, count: number, ttlMs: number): void | Promise<void>;
}

export interface RateLimitOptions {
  limit: number;
  window: RateLimitWindow | string;
  keyFn?: (req: NextRequest) => string;
  store?: RateLimitStore;
}

const WINDOW_MS: Record<string, number> = {
  "30s": 30_000,
  "1m": 60_000,
  "5m": 300_000,
  "1h": 3_600_000,
};

export function parseWindowToMs(w: string): number {
  const known = WINDOW_MS[w];
  if (known !== undefined) return known;
  const m = /^(\d+)(ms|s|m|h)$/i.exec(w.trim());
  if (!m) throw new Error(`Invalid rate limit window: ${w}`);
  const n = Number(m[1]);
  const u = m[2]!.toLowerCase();
  if (u === "ms") return n;
  if (u === "s") return n * 1000;
  if (u === "m") return n * 60_000;
  return n * 3_600_000;
}

function createMemoryStore(): Required<Pick<RateLimitStore, "increment">> {
  const data = new Map<string, { count: number; expiresAt: number }>();
  return {
    increment(key: string, ttlMs: number): number {
      const now = Date.now();
      const row = data.get(key);
      if (!row || now > row.expiresAt) {
        data.set(key, { count: 1, expiresAt: now + ttlMs });
        return 1;
      }
      row.count += 1;
      return row.count;
    },
  };
}

export function rateLimit(options: RateLimitOptions) {
  const ttlMs = parseWindowToMs(options.window);
  const store: RateLimitStore = options.store ?? createMemoryStore();
  const keyFn = options.keyFn ?? ((req: NextRequest) => getClientIp(req) || "unknown");

  const tooMany = () => {
    const retryAfterSec = Math.ceil(ttlMs / 1000);
    const base = jsonError("Too many requests", 429, {
      limit: options.limit,
      window: options.window,
    });
    const headers = new Headers(base.headers);
    headers.set("Retry-After", String(retryAfterSec));
    return new Response(base.body, { status: base.status, headers });
  };

  return async (req: NextRequest): Promise<Response | void> => {
    const key = keyFn(req);

    if (store.increment) {
      const count = await store.increment(key, ttlMs);
      if (count > options.limit) return tooMany();
      return;
    }

    if (!store.get || !store.set) {
      throw new Error("rateLimit: store must implement `increment` or both `get` and `set`");
    }
    const prev = (await store.get(key)) ?? 0;
    if (prev >= options.limit) return tooMany();
    await store.set(key, prev + 1, ttlMs);
  };
}
