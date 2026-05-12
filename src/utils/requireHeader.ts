import { jsonError } from "../response/jsonError.js";

function lower(name: string): string {
  return name.toLowerCase();
}

export function requireHeader(req: Request, headerName: string): string {
  const value = req.headers.get(headerName);
  if (value !== null && value !== "") return value;
  const n = lower(headerName);
  const isAuth = n === "authorization";
  const status = isAuth ? 401 : 400;
  throw jsonError(`Missing header: ${headerName}`, status);
}
