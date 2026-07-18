import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { ApplicationError } from "@/shared/application/errors";
import { ConflictError, DomainError, NotFoundError, ValidationError } from "@/shared/domain/errors";

import { HttpProblem, type ProblemDetails } from "./http-problem";

export function dataResponse<Data>(
  data: Data,
  status = 200,
): NextResponse<{ readonly data: Data }> {
  return NextResponse.json({ data }, { status });
}

export function noContentResponse(): Response {
  return new Response(null, { status: 204 });
}

export function problemResponse(
  error: unknown,
  correlationId: string,
): NextResponse<ProblemDetails> {
  const normalized = normalizeProblem(error);
  const body: ProblemDetails = {
    code: normalized.code,
    correlationId,
    detail: normalized.message,
    ...(normalized.errors === undefined ? {} : { errors: normalized.errors }),
    status: normalized.status,
    title: normalized.title,
    type: `https://agent-auditor.local/problems/${normalized.code.toLowerCase()}`,
  };

  return NextResponse.json(body, {
    headers: { "content-type": "application/problem+json" },
    status: normalized.status,
  });
}

interface NormalizedProblem {
  readonly code: string;
  readonly errors?: readonly { readonly field: string; readonly message: string }[];
  readonly message: string;
  readonly status: number;
  readonly title: string;
}

function normalizeProblem(error: unknown): NormalizedProblem {
  if (error instanceof HttpProblem) {
    return {
      code: error.code,
      ...(error.errors === undefined ? {} : { errors: error.errors }),
      message: error.message,
      status: error.status,
      title: titleFor(error.status),
    };
  }
  if (error instanceof NotFoundError) {
    return { code: error.code, message: error.message, status: 404, title: "Not found" };
  }
  if (error instanceof ConflictError) {
    return { code: error.code, message: error.message, status: 409, title: "Conflict" };
  }
  if (error instanceof ValidationError) {
    return { code: error.code, message: error.message, status: 422, title: "Validation failed" };
  }
  if (error instanceof DomainError) {
    return { code: error.code, message: error.message, status: 422, title: "Domain rule rejected" };
  }
  if (error instanceof ApplicationError) {
    const status =
      error.code === "LIVE_MODE_UNAVAILABLE" ? 503 : error.code.includes("CONFLICT") ? 409 : 500;
    return { code: error.code, message: error.message, status, title: titleFor(status) };
  }
  if (error instanceof ZodError) {
    return {
      code: "VALIDATION_FAILED",
      errors: error.issues.map((issue) => ({
        field: issue.path.join("."),
        message: issue.message,
      })),
      message: "The request does not satisfy the API contract.",
      status: 422,
      title: "Validation failed",
    };
  }
  return {
    code: "INTERNAL_ERROR",
    message: "An unexpected error occurred.",
    status: 500,
    title: "Internal error",
  };
}

function titleFor(status: number): string {
  if (status === 400) return "Bad request";
  if (status === 403) return "Forbidden";
  if (status === 404) return "Not found";
  if (status === 409) return "Conflict";
  if (status === 413) return "Request too large";
  if (status === 415) return "Unsupported media type";
  if (status === 422) return "Validation failed";
  if (status === 503) return "Service unavailable";
  return "Internal error";
}
