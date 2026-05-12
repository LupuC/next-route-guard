export function jsonError(
  message: string,
  status: number = 500,
  details?: unknown,
): Response {
  const body: Record<string, unknown> = { error: message, status };
  if (details !== undefined) body.details = details;
  return Response.json(body, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
