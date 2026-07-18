import { describe, expect, it } from "vitest";

import { problemResponse } from "@/shared/presentation/http/response";

describe("safe API errors", () => {
  it("does not expose unexpected messages or stack traces", async () => {
    const secret = "internal-path-and-secret-canary";
    const response = problemResponse(new Error(secret), "correlation-1");
    const serialized = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(response.headers.get("content-type")).toContain("application/problem+json");
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain("stack");
    expect(serialized).toContain("correlation-1");
  });
});
