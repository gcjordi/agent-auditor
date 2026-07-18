import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  getMutationToken,
  MUTATION_TOKEN_HEADER,
} from "@/shared/infrastructure/security/mutation-token";
import { assertSafeMutationRequest, parseJsonBody } from "@/shared/presentation/http/request";

const bodySchema = z.object({ name: z.string().max(20) }).strict();

describe("HTTP request security boundary", () => {
  it("accepts a bounded same-origin JSON mutation", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/agents", {
      body: JSON.stringify({ name: "Synthetic Agent" }),
      headers: {
        "content-type": "application/json",
        [MUTATION_TOKEN_HEADER]: getMutationToken(),
        origin: "http://127.0.0.1:3000",
      },
      method: "POST",
    });

    expect(() => {
      assertSafeMutationRequest(request);
    }).not.toThrow();
    await expect(parseJsonBody(request, bodySchema)).resolves.toEqual({ name: "Synthetic Agent" });
  });

  it("rejects a cross-origin mutation", () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/agents", {
      headers: {
        [MUTATION_TOKEN_HEADER]: getMutationToken(),
        origin: "https://untrusted.invalid",
      },
      method: "POST",
    });
    expect(() => {
      assertSafeMutationRequest(request);
    }).toThrow(/origin/iu);
  });

  it("uses validated proxy authority when the framework canonicalizes Request.url", () => {
    const request = new Request("http://localhost:3000/api/v1/agents", {
      headers: {
        host: "127.0.0.1:3100",
        [MUTATION_TOKEN_HEADER]: getMutationToken(),
        origin: "http://127.0.0.1:3100",
        "x-forwarded-host": "127.0.0.1:3100",
        "x-forwarded-proto": "http",
      },
      method: "POST",
    });

    expect(() => {
      assertSafeMutationRequest(request);
    }).not.toThrow();
  });

  it("rejects a non-loopback Host even when forwarded metadata claims loopback", () => {
    const request = new Request("http://localhost:3000/api/v1/agents", {
      headers: {
        host: "untrusted.invalid",
        [MUTATION_TOKEN_HEADER]: getMutationToken(),
        origin: "http://127.0.0.1:3100",
        "x-forwarded-host": "127.0.0.1:3100",
        "x-forwarded-proto": "http",
      },
      method: "POST",
    });

    expect(() => {
      assertSafeMutationRequest(request);
    }).toThrow(/loopback/iu);
  });

  it("fails closed with a stable problem for a malformed Origin header", () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/agents", {
      headers: {
        [MUTATION_TOKEN_HEADER]: getMutationToken(),
        origin: "not a valid origin",
      },
      method: "POST",
    });
    try {
      assertSafeMutationRequest(request);
      throw new Error("Expected malformed Origin to be rejected.");
    } catch (error: unknown) {
      expect(error).toMatchObject({ code: "ORIGIN_REJECTED", status: 403 });
    }
  });

  it("rejects oversized content before parsing", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/agents", {
      body: JSON.stringify({ name: "x".repeat(128) }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await expect(parseJsonBody(request, bodySchema, 32)).rejects.toMatchObject({
      code: "REQUEST_TOO_LARGE",
      status: 413,
    });
  });

  it("rejects prototype-pollution-shaped input", async () => {
    const request = new Request("http://127.0.0.1:3000/api/v1/agents", {
      body: '{"name":"safe","__proto__":{"polluted":true}}',
      headers: { "content-type": "application/json" },
      method: "POST",
    });
    await expect(parseJsonBody(request, bodySchema)).rejects.toMatchObject({
      code: "UNSAFE_OBJECT_KEY",
      status: 422,
    });
  });
});
