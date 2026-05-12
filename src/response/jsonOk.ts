export function jsonOk<T>(data: T, status: number = 200): Response {
  return Response.json(data, {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
