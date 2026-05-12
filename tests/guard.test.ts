import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { NextRequest, NextResponse } from "next/server";
import { createGuard } from "../src/guard/createGuard.js";
import { matchRoutePattern } from "../src/utils/pathMatch.js";

describe("path match", () => {
  it("matches exact and params", () => {
    expect(matchRoutePattern("/", "/")).toBe(true);
    expect(matchRoutePattern("/dashboard", "/dashboard")).toBe(true);
    expect(matchRoutePattern("/a/:id", "/a/b")).toBe(true);
    expect(matchRoutePattern("/a/:path*", "/a/b/c")).toBe(true);
  });
});

async function mint(secret: string, payload: Record<string, unknown> = { role: "admin" }) {
  const key = new TextEncoder().encode(secret);
  return await new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .sign(key);
}

describe("createGuard jose", () => {
  const secret = "secretsecretsecretsecretsecret12";

  it("allows public paths", async () => {
    const { middleware } = createGuard({
      adapter: "jose",
      secret,
      protect: ["/dashboard/:path*"],
      public: ["/login"],
      redirectTo: "/login",
    });
    const req = new NextRequest(new URL("http://x/login"));
    const ctx = {} as import("next/server").NextFetchEvent;
    const res = await middleware(req, ctx);
    expect(res).toBeInstanceOf(NextResponse);
  });

  it("redirects when unauthenticated on protected path", async () => {
    const { middleware } = createGuard({
      adapter: "jose",
      secret,
      protect: ["/dashboard/:path*"],
      redirectTo: "/login",
    });
    const req = new NextRequest(new URL("http://x/dashboard/foo"));
    const ctx = {} as import("next/server").NextFetchEvent;
    const res = await middleware(req, ctx);
    expect(res).toBeDefined();
    expect(res!.status).toBeGreaterThanOrEqual(300);
    expect(res!.status).toBeLessThan(400);
  });

  it("allows authenticated jose session", async () => {
    const token = await mint(secret);
    const { middleware } = createGuard({
      adapter: "jose",
      secret,
      cookieName: "token",
      protect: ["/dashboard/:path*"],
      redirectTo: "/login",
    });
    const req = new NextRequest(new URL("http://x/dashboard/foo"), {
      headers: { cookie: `token=${token}` },
    });
    const ctx = {} as import("next/server").NextFetchEvent;
    const res = await middleware(req, ctx);
    expect(res).toBeInstanceOf(NextResponse);
  });
});
