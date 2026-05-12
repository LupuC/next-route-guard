import type { NextRequest } from "next/server";
import { jsonError } from "../response/jsonError.js";
import { getClientIp } from "../utils/getClientIp.js";

export type RateLimitWindow = "30s" | "1m" | "5m" | "1h";

export interface RateLimitStore {
  get(key: string): number | null;
  set(key: string, count: number, ttlMs: number): void;
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

function createMemoryStore(): RateLimitStore {
  const data = new Map<string, { count: number; expiresAt: number }>();
  return {
    get(key: string): number | null {
      const row = data.get(key);
      if (!row) return null;
      if (Date.now() > row.expiresAt) {
        data.delete(key);
        return null;
      }
      return row.count;
    },
    set(key: string, count: number, ttlMs: number) {
      data.set(key, { count, expiresAt: Date.now() + ttlMs });
    },
  };
}

export function rateLimit(options: RateLimitOptions) {
  const ttlMs = parseWindowToMs(options.window);
  const store = options.store ?? createMemoryStore();
  const keyFn = options.keyFn ?? ((req: NextRequest) => getClientIp(req) || "unknown");

  return async (req: NextRequest): Promise<Response | void> => {
    const key = keyFn(req);
    const prev = store.get(key) ?? 0;
    if (prev >= options.limit) {
      const retryAfterSec = Math.ceil(ttlMs / 1000);
      const base = jsonError("Too many requests", 429, {
        limit: options.limit,
        window: options.window,
      });
      const headers = new Headers(base.headers);
      headers.set("Retry-After", String(retryAfterSec));
      return new Response(base.body, { status: base.status, headers });
    }
    store.set(key, prev + 1, ttlMs);
  };
}
