import { describe, expect, it } from "vitest";
import { z } from "zod";
import { NextRequest } from "next/server";
import { compose } from "../src/compose/compose.js";
import { getClientIp } from "../src/utils/getClientIp.js";
import { parseJson } from "../src/utils/parseJson.js";
import { requireHeader } from "../src/utils/requireHeader.js";
import { getParsedBody, validateBody } from "../src/utils/validateBody.js";

describe("getClientIp", () => {
  it("reads x-forwarded-for first", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" } });
    expect(getClientIp(req)).toBe("1.1.1.1");
  });
});

describe("parseJson", () => {
  it("returns null on bad input", async () => {
    const req = new Request("http://x", { method: "POST", body: "not-json" });
    expect(await parseJson(req)).toBeNull();
  });
});

describe("validateBody", () => {
  it("runs zod and attaches body", async () => {
    const schema = z.object({ n: z.number() });
    const h = compose(validateBody(schema), async (req: NextRequest) => {
      const b = getParsedBody<{ n: number }>(req);
      return Response.json(b);
    });
    const req = new NextRequest(new URL("http://x"), {
      method: "POST",
      body: JSON.stringify({ n: 5 }),
      headers: { "Content-Type": "application/json" },
    });
    const res = await h(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ n: 5 });
  });
});

describe("requireHeader", () => {
  it("uses 401 for authorization", () => {
    const req = new Request("http://x");
    let thrown: unknown;
    try {
      requireHeader(req, "authorization");
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(Response);
    expect((thrown as Response).status).toBe(401);
  });
});
