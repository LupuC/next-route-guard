/**
 * Match a Next.js-style route pattern against a pathname.
 * Supports `:param` (single segment) and `:param*` (zero or more segments).
 */
export function normalizePathname(pathname: string): string {
  if (pathname === "" || pathname === "/") return "/";
  const p = pathname.endsWith("/") && pathname.length > 1 ? pathname.slice(0, -1) : pathname;
  return p.startsWith("/") ? p : `/${p}`;
}

export function matchRoutePattern(pattern: string, pathname: string): boolean {
  const pat = normalizePathname(pattern);
  const path = normalizePathname(pathname);
  if (pat === "/") return path === "/";

  const ps = pat.split("/").filter(Boolean);
  const ts = path.split("/").filter(Boolean);

  function dfs(pi: number, ti: number): boolean {
    if (pi === ps.length && ti === ts.length) return true;
    if (pi >= ps.length) return false;

    const seg = ps[pi]!;

    if (seg.startsWith(":") && seg.endsWith("*")) {
      for (let k = ti; k <= ts.length; k += 1) {
        if (dfs(pi + 1, k)) return true;
      }
      return false;
    }

    if (seg.startsWith(":")) {
      if (ti >= ts.length) return false;
      return dfs(pi + 1, ti + 1);
    }

    if (ti >= ts.length || seg !== ts[ti]) return false;
    return dfs(pi + 1, ti + 1);
  }

  return dfs(0, 0);
}

export function matchesAnyPattern(patterns: string[], pathname: string): boolean {
  const path = normalizePathname(pathname);
  return patterns.some((p) => matchRoutePattern(p, path));
}
