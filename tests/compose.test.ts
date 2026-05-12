import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { compose } from "../src/compose/compose.js";
import { jsonError } from "../src/response/jsonError.js";
import { jsonOk } from "../src/response/jsonOk.js";

describe("compose", () => {
  it("runs middleware then handler", async () => {
    const h = compose(
      async (_req: NextRequest) => {},
      async (req: NextRequest) => jsonOk({ ok: true, path: req.nextUrl.pathname }),
    );
    const req = new NextRequest(new URL("http://localhost/x"));
    const res = await h(req);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  it("short-circuits on Response", async () => {
    const h = compose(
      async (_req: NextRequest) => jsonError("nope", 400),
      async () => jsonOk({ bad: true }),
    );
    const res = await h(new NextRequest(new URL("http://localhost/")));
    expect(res.status).toBe(400);
  });

  it("catches thrown Response", async () => {
    const h = compose(
      async () => {
        throw jsonError("missing", 401);
      },
      async () => jsonOk({ n: 1 }),
    );
    const res = await h(new NextRequest(new URL("http://localhost/")));
    expect(res.status).toBe(401);
  });
});
