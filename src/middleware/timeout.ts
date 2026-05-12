import type { NextRequest } from "next/server";
import { jsonError } from "../response/jsonError.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

const deadlineMap = new WeakMap<NextRequest, number>();

export function timeout(ms: number) {
  return async (req: NextRequest): Promise<void> => {
    const prev = deadlineMap.get(req);
    const nextMs = prev === undefined ? ms : Math.min(prev, ms);
    deadlineMap.set(req, nextMs);
  };
}

export function consumeRequestTimeout(req: NextRequest): number | undefined {
  const v = deadlineMap.get(req);
  if (v !== undefined) deadlineMap.delete(req);
  return v;
}

export { sleep };

export async function raceHandler(
  req: NextRequest,
  run: () => Promise<Response>,
): Promise<Response> {
  const ms = consumeRequestTimeout(req);
  if (ms === undefined) return run();
  return await Promise.race([
    run(),
    sleep(ms).then(() => jsonError("Request timeout", 408)),
  ]);
}
