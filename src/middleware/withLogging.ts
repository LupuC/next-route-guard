import type { NextRequest } from "next/server";

export interface LogEntry {
  method: string;
  pathname: string;
  status: number;
  durationMs: number;
}

export function withLogging<T extends NextRequest>(
  handler: (req: T) => Response | Promise<Response>,
  logger: (entry: LogEntry) => void = (e) => console.log(e),
) {
  return async (req: T): Promise<Response> => {
    const start = Date.now();
    try {
      const res = await handler(req);
      const durationMs = Date.now() - start;
      logger({
        method: req.method,
        pathname: req.nextUrl?.pathname ?? new URL(req.url).pathname,
        status: res.status,
        durationMs,
      });
      return res;
    } catch (e) {
      const durationMs = Date.now() - start;
      logger({
        method: req.method,
        pathname: req.nextUrl?.pathname ?? new URL(req.url).pathname,
        status: e instanceof Response ? e.status : 500,
        durationMs,
      });
      throw e;
    }
  };
}
