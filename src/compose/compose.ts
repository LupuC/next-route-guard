import type { NextRequest } from "next/server";
import { applyCorsHeaders } from "../middleware/cors.js";
import { raceHandler } from "../middleware/timeout.js";

export type MiddlewareFn<T extends NextRequest = NextRequest> = (
  req: T,
) => void | Response | Promise<void | Response>;

export type HandlerFn<T extends NextRequest = NextRequest> = (
  req: T,
) => Response | Promise<Response>;

function isResponse(r: unknown): r is Response {
  return r instanceof Response;
}

/**
 * Compose middlewares (left→right), then the final route handler (last argument).
 * Stops early if any step returns a Response.
 * A thrown `Response` is treated as a normal return value.
 */
export function compose<T extends NextRequest = NextRequest>(
  ...parts: [...MiddlewareFn<T>[], HandlerFn<T>]
): (req: T) => Promise<Response> {
  if (parts.length === 0) {
    throw new Error("compose requires at least one handler function");
  }
  const handler = parts[parts.length - 1] as HandlerFn<T>;
  const middlewares = parts.slice(0, -1) as MiddlewareFn<T>[];

  return async (req: T) => {
    for (const mw of middlewares) {
      let out: void | Response | undefined;
      try {
        out = await mw(req);
      } catch (e) {
        if (e instanceof Response) return applyCorsHeaders(req, e);
        throw e;
      }
      if (isResponse(out)) return applyCorsHeaders(req, out);
    }

    try {
      const res = await raceHandler(req, () => Promise.resolve(handler(req)));
      return applyCorsHeaders(req, res);
    } catch (e) {
      if (e instanceof Response) return applyCorsHeaders(req, e);
      throw e;
    }
  };
}
