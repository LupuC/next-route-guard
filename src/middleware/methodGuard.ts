import type { NextRequest } from "next/server";

export function methodGuard(methods: string[]) {
  const allowed = new Set(methods.map((m) => m.toUpperCase()));
  return async (req: NextRequest): Promise<Response | void> => {
    const m = req.method.toUpperCase();
    if (!allowed.has(m)) {
      const allow = [...allowed].join(", ");
      return new Response(null, {
        status: 405,
        headers: {
          Allow: allow,
        },
      });
    }
  };
}
