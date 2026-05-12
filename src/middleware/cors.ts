import type { NextRequest } from "next/server";

export type CorsOrigin =
  | "*"
  | string
  | string[]
  | ((origin: string) => boolean);

export interface CorsOptions {
  origin?: CorsOrigin;
  methods?: string[];
  allowedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

const optsMap = new WeakMap<NextRequest, Required<Pick<CorsOptions, "methods">> & CorsOptions>();

const DEFAULT_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS"];

function normalizeMethod(m: string): string {
  return m.toUpperCase();
}

function requestOrigin(req: NextRequest): string {
  return req.headers.get("origin") ?? "";
}

function isOriginAllowed(
  origin: CorsOrigin | undefined,
  reqOrigin: string,
): boolean {
  if (origin === undefined || origin === "*") return true;
  if (typeof origin === "string") return origin === reqOrigin;
  if (Array.isArray(origin)) return origin.includes(reqOrigin);
  return origin(reqOrigin);
}

function vary(resHeaders: Headers, name: string) {
  const cur = resHeaders.get("Vary");
  if (!cur) resHeaders.set("Vary", name);
  else if (!cur.split(",").map((s) => s.trim()).includes(name)) {
    resHeaders.set("Vary", `${cur}, ${name}`);
  }
}

function buildHeaders(
  req: NextRequest,
  cfg: CorsOptions,
  forPreflight: boolean,
): Headers {
  const h = new Headers();
  const reqOrigin = requestOrigin(req);
  const methods = (cfg.methods ?? DEFAULT_METHODS).map(normalizeMethod);

  let allowOrigin = "*";
  if (cfg.origin === undefined || cfg.origin === "*") {
    allowOrigin = "*";
  } else if (typeof cfg.origin === "string") {
    allowOrigin = cfg.origin;
  } else if (Array.isArray(cfg.origin)) {
    allowOrigin = cfg.origin.includes(reqOrigin) ? reqOrigin : "null";
  } else {
    allowOrigin = cfg.origin(reqOrigin) ? reqOrigin : "null";
  }

  if (cfg.credentials && allowOrigin !== "*") {
    h.set("Access-Control-Allow-Origin", reqOrigin || allowOrigin);
    h.set("Access-Control-Allow-Credentials", "true");
  } else {
    h.set("Access-Control-Allow-Origin", allowOrigin === "null" ? "null" : allowOrigin);
    if (cfg.credentials) {
      h.set("Access-Control-Allow-Credentials", "true");
    }
  }

  if (forPreflight) {
    h.set("Access-Control-Allow-Methods", methods.join(", "));
    const reqHeaders = req.headers.get("access-control-request-headers");
    if (reqHeaders) {
      h.set("Access-Control-Allow-Headers", reqHeaders);
    } else if (cfg.allowedHeaders?.length) {
      h.set("Access-Control-Allow-Headers", cfg.allowedHeaders.join(", "));
    }
    if (cfg.maxAge !== undefined) {
      h.set("Access-Control-Max-Age", String(cfg.maxAge));
    }
  }

  return h;
}

export function cors(options: CorsOptions = {}) {
  return async (req: NextRequest): Promise<Response | void> => {
    const reqOrigin = requestOrigin(req);
    if (!isOriginAllowed(options.origin, reqOrigin) && options.origin !== "*" && options.origin !== undefined) {
      return new Response(null, { status: 403 });
    }

    const cfg: CorsOptions = {
      ...options,
      methods: (options.methods ?? DEFAULT_METHODS).map(normalizeMethod),
    };

    optsMap.set(req, cfg as Required<Pick<CorsOptions, "methods">> & CorsOptions);

    if (req.method === "OPTIONS") {
      const headers = buildHeaders(req, cfg, true);
      return new Response(null, { status: 204, headers });
    }
  };
}

export function applyCorsHeaders(req: NextRequest, res: Response): Response {
  const cfg = optsMap.get(req);
  optsMap.delete(req);
  if (!cfg) return res;

  const merged = new Headers(res.headers);
  vary(merged, "Origin");

  const extra = buildHeaders(req, cfg, false);
  extra.forEach((v, k) => {
    merged.set(k, v);
  });

  const reqMethod = normalizeMethod(req.method);
  const allowed = (cfg.methods ?? DEFAULT_METHODS).map(normalizeMethod);
  if (!allowed.includes(reqMethod)) {
    return res;
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: merged,
  });
}
