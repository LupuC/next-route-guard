import type { NextRequest } from "next/server";
import { jsonError } from "../response/jsonError.js";
import { parseJson } from "./parseJson.js";

export interface SafeParseSuccess<T> {
  success: true;
  data: T;
}

export interface SafeParseFailure {
  success: false;
  error: unknown;
}

export interface SafeParseSchema<T> {
  safeParse: (input: unknown) => SafeParseSuccess<T> | SafeParseFailure;
}

const parsedBodies = new WeakMap<NextRequest, unknown>();

function formatValidationDetails(error: unknown): unknown {
  if (error && typeof error === "object" && "flatten" in error && typeof (error as { flatten?: () => unknown }).flatten === "function") {
    return (error as { flatten: () => unknown }).flatten();
  }
  if (error && typeof error === "object" && "issues" in error) {
    return error;
  }
  return String(error);
}

export function validateBody<T>(schema: SafeParseSchema<T>) {
  return async (req: NextRequest): Promise<void | Response> => {
    const raw = await parseJson(req);
    const result = schema.safeParse(raw);
    if (!result.success) {
      return jsonError("Validation failed", 400, formatValidationDetails(result.error));
    }
    parsedBodies.set(req, result.data);
  };
}

export function getParsedBody<T>(req: NextRequest): T {
  const v = parsedBodies.get(req);
  if (v === undefined) {
    throw new Error("getParsedBody: no validated body attached to this request (did validateBody run?)");
  }
  return v as T;
}
