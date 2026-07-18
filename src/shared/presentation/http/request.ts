import { randomUUID } from "node:crypto";

import { type z } from "zod";

import {
  isValidMutationToken,
  MUTATION_TOKEN_HEADER,
} from "@/shared/infrastructure/security/mutation-token";

import { HttpProblem } from "./http-problem";

const DEFAULT_MAXIMUM_BODY_BYTES = 128 * 1024;
const CORRELATION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/u;
const dangerousObjectKeys = new Set(["__proto__", "constructor", "prototype"]);

export function correlationIdFor(request: Request): string {
  const supplied = request.headers.get("x-correlation-id");
  return supplied !== null && CORRELATION_ID_PATTERN.test(supplied) ? supplied : randomUUID();
}

export async function parseJsonBody<Schema extends z.ZodType>(
  request: Request,
  schema: Schema,
  maximumBytes = DEFAULT_MAXIMUM_BODY_BYTES,
): Promise<z.output<Schema>> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim();
  if (contentType !== "application/json") {
    throw new HttpProblem(415, "UNSUPPORTED_MEDIA_TYPE", "Expected an application/json body.");
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null && Number(declaredLength) > maximumBytes) {
    throw new HttpProblem(413, "REQUEST_TOO_LARGE", "The request body exceeds the size limit.");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new HttpProblem(413, "REQUEST_TOO_LARGE", "The request body exceeds the size limit.");
  }

  let candidate: unknown;
  try {
    candidate = JSON.parse(text) as unknown;
  } catch {
    throw new HttpProblem(400, "MALFORMED_JSON", "The request body is not valid JSON.");
  }

  if (containsDangerousObjectKey(candidate)) {
    throw new HttpProblem(422, "UNSAFE_OBJECT_KEY", "The request contains a reserved object key.");
  }

  const parsed = schema.safeParse(candidate);
  if (!parsed.success) {
    throw new HttpProblem(
      422,
      "VALIDATION_FAILED",
      "The request does not satisfy the API contract.",
      parsed.error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
    );
  }
  return parsed.data;
}

export function assertSafeMutationRequest(request: Request): void {
  const requestUrl = new URL(request.url);
  const directAuthority = request.headers.get("host") ?? requestUrl.host;
  const forwardedAuthority = optionalSingleHeaderValue(request.headers.get("x-forwarded-host"));
  const protocol =
    optionalSingleHeaderValue(request.headers.get("x-forwarded-proto")) ??
    requestUrl.protocol.slice(0, -1);

  const directOrigin = localOrigin(protocol, directAuthority);
  const effectiveOrigin =
    forwardedAuthority === undefined ? directOrigin : localOrigin(protocol, forwardedAuthority);
  if (!isLoopbackHostname(directOrigin.hostname)) {
    throw new HttpProblem(
      403,
      "LOCAL_ACCESS_REQUIRED",
      "Mutations are limited to loopback access.",
    );
  }

  const origin = request.headers.get("origin");
  if (origin !== null) {
    try {
      const parsedOrigin = new URL(origin);
      if (origin !== parsedOrigin.origin || parsedOrigin.origin !== effectiveOrigin.origin) {
        throw new HttpProblem(403, "ORIGIN_REJECTED", "The request origin is not allowed.");
      }
    } catch (error: unknown) {
      if (error instanceof HttpProblem) throw error;
      throw new HttpProblem(403, "ORIGIN_REJECTED", "The request origin is not allowed.");
    }
  }

  if (!isValidMutationToken(request.headers.get(MUTATION_TOKEN_HEADER))) {
    throw new HttpProblem(
      403,
      "MUTATION_TOKEN_REQUIRED",
      "A valid local mutation token is required.",
    );
  }
}

function optionalSingleHeaderValue(value: string | null): string | undefined {
  if (value === null) return undefined;
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.includes(",")) {
    throw new HttpProblem(403, "ORIGIN_REJECTED", "The request origin metadata is invalid.");
  }
  return normalized;
}

function localOrigin(protocol: string, authority: string): URL {
  if (protocol !== "http" && protocol !== "https") {
    throw new HttpProblem(403, "ORIGIN_REJECTED", "The request protocol is not allowed.");
  }
  try {
    const parsed = new URL(`${protocol}://${authority}`);
    if (
      parsed.username.length > 0 ||
      parsed.password.length > 0 ||
      parsed.pathname !== "/" ||
      parsed.search.length > 0 ||
      parsed.hash.length > 0 ||
      !isLoopbackHostname(parsed.hostname)
    ) {
      throw new HttpProblem(
        403,
        "LOCAL_ACCESS_REQUIRED",
        "Mutations are limited to loopback access.",
      );
    }
    return parsed;
  } catch (error: unknown) {
    if (error instanceof HttpProblem) throw error;
    throw new HttpProblem(403, "ORIGIN_REJECTED", "The request origin metadata is invalid.");
  }
}

function isLoopbackHostname(hostname: string): boolean {
  return (
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]" ||
    hostname === "localhost"
  );
}

function containsDangerousObjectKey(value: unknown, depth = 0): boolean {
  if (depth > 32) return true;
  if (Array.isArray(value))
    return value.some((item) => containsDangerousObjectKey(item, depth + 1));
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(
    ([key, nested]) =>
      dangerousObjectKeys.has(key) || containsDangerousObjectKey(nested, depth + 1),
  );
}
