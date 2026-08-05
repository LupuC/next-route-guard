import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { compose } from "../src/compose/compose.js";
import { cors } from "../src/middleware/cors.js";
import { methodGuard } from "../src/middleware/methodGuard.js";
import { parseWindowToMs, rateLimit } from "../src/middleware/rateLimit.js";
import { jsonOk } from "../src/response/jsonOk.js";

describe("cors", () => {
  it("handles preflight", async () => {
    const h = compose(cors({ origin: "https://a.com" }), async () => jsonOk({ ok: 1 }));
    const req = new NextRequest(new URL("http://localhost/api"), {
      method: "OPTIONS",
      headers: { origin: "https://a.com", "access-control-request-method": "POST" },
    });
    const res = await h(req);
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeTruthy();
  });

  it("never combines wildcard origin with credentials", async () => {
    const h = compose(cors({ credentials: true }), async () => jsonOk({ ok: 1 }));
    const req = new NextRequest(new URL("http://localhost/api"), {
      headers: { origin: "https://a.com" },
    });
    const res = await h(req);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("https://a.com");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("keeps wildcard when credentials are off", async () => {
    const h = compose(cors(), async () => jsonOk({ ok: 1 }));
    const req = new NextRequest(new URL("http://localhost/api"), {
      headers: { origin: "https://a.com" },
    });
    const res = await h(req);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });
});

describe("rateLimit", () => {
  it("parses windows", () => {
    expect(parseWindowToMs("1m")).toBe(60_000);
    expect(parseWindowToMs("2s")).toBe(2000);
  });

  it("returns 429 when exceeded", async () => {
    const rl = rateLimit({ limit: 2, window: "1m" });
    const h = compose(rl, async () => jsonOk({ ok: 1 }));
    const base = () =>
      new NextRequest(new URL("http://localhost/x"), {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
    await h(base());
    await h(base());
    const res = await h(base());
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
  });

  it("supports async get/set stores", async () => {
    const data = new Map<string, number>();
    const rl = rateLimit({
      limit: 2,
      window: "1m",
      store: {
        get: async (key) => data.get(key) ?? null,
        set: async (key, count) => {
          data.set(key, count);
        },
      },
    });
    const h = compose(rl, async () => jsonOk({ ok: 1 }));
    const base = () =>
      new NextRequest(new URL("http://localhost/x"), {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
    expect((await h(base())).status).toBe(200);
    expect((await h(base())).status).toBe(200);
    expect((await h(base())).status).toBe(429);
  });

  it("uses a fixed window that does not slide on each request", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const rl = rateLimit({ limit: 3, window: "1m" });
    const h = compose(rl, async () => jsonOk({ ok: 1 }));
    const base = () =>
      new NextRequest(new URL("http://localhost/x"), {
        headers: { "x-forwarded-for": "1.2.3.4" },
      });
    // One request every 25s stays under 3/min forever; with a sliding
    // window the count would accumulate and eventually block.
    for (let i = 0; i < 10; i += 1) {
      expect((await h(base())).status).toBe(200);
      vi.setSystemTime((i + 1) * 25_000);
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("methodGuard", () => {
  it("returns 405", async () => {
    const h = compose(methodGuard(["GET"]), async () => jsonOk({ ok: 1 }));
    const req = new NextRequest(new URL("http://localhost/x"), { method: "POST" });
    const res = await h(req);
    expect(res.status).toBe(405);
    expect(res.headers.get("Allow")).toContain("GET");
  });
});
