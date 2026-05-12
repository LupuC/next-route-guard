import { describe, expect, it } from "vitest";
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
