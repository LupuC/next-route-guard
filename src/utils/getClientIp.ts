function firstIp(raw: string | null): string {
  if (!raw) return "";
  const part = raw.split(",")[0]?.trim() ?? "";
  if (!part) return "";
  const cleaned = part.replace(/^::ffff:/, "");
  return cleaned;
}

export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return firstIp(xff);
  const xReal = req.headers.get("x-real-ip");
  if (xReal) return firstIp(xReal);
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return firstIp(cf);
  return "";
}
