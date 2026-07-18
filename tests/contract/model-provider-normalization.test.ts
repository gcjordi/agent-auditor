import OpenAI from "openai";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import type { StructuredModelRequest } from "@/shared/application/ports/model-client";
import { parseServerConfig } from "@/shared/infrastructure/config/server-config";
import { DemoModelClient } from "@/shared/infrastructure/providers/demo-model-client";
import {
  createOpenAiModelClient,
  OpenAiModelClient,
} from "@/shared/infrastructure/providers/openai-model-client";

const sdkMocks = vi.hoisted(() => ({
  constructorOptions: vi.fn(),
  responsesCreate: vi.fn(),
}));

vi.mock("openai", () => {
  class MockApiError extends Error {
    readonly status: number;

    constructor(status: number) {
      super(`Synthetic provider error ${status}`);
      this.name = "APIError";
      this.status = status;
    }
  }

  class MockOpenAI {
    static readonly APIError = MockApiError;
    readonly responses = { create: sdkMocks.responsesCreate };

    constructor(options: unknown) {
      sdkMocks.constructorOptions(options);
    }
  }

  return { default: MockOpenAI };
});

const outputSchema = z.object({ label: z.string() }).strict();

function makeRequest(
  overrides: Partial<StructuredModelRequest<{ readonly label: string }>> = {},
): StructuredModelRequest<{ readonly label: string }> {
  return {
    input: "Synthetic fixture input",
    instructions: "Return the requested JSON object.",
    outputBudget: 256,
    purpose: "SURFACE_ANALYSIS",
    timeoutMs: 2_500,
    validate: (value) => outputSchema.parse(value),
    ...overrides,
  };
}

beforeEach(() => {
  sdkMocks.constructorOptions.mockReset();
  sdkMocks.responsesCreate.mockReset();
});

describe("Demo provider normalization", () => {
  it("does not evaluate a fixture after caller cancellation", async () => {
    const fixtureFactory = vi.fn(() => ({ label: "must-not-run" }));
    const controller = new AbortController();
    controller.abort();

    await expect(
      new DemoModelClient(fixtureFactory).generateStructured(
        makeRequest({ abortSignal: controller.signal }),
      ),
    ).resolves.toEqual({
      kind: "provider-error",
      retryable: false,
      safeErrorCode: "REQUEST_ABORTED",
    });
    expect(fixtureFactory).not.toHaveBeenCalled();
  });

  it("passes only the declared purpose to its deterministic fixture factory", async () => {
    const fixtureFactory = vi.fn(() => ({ label: "planned" }));

    await expect(
      new DemoModelClient(fixtureFactory).generateStructured(
        makeRequest({ purpose: "TEST_PLANNING" }),
      ),
    ).resolves.toEqual({ kind: "success", output: { label: "planned" } });
    expect(fixtureFactory).toHaveBeenCalledOnce();
    expect(fixtureFactory).toHaveBeenCalledWith("TEST_PLANNING");
  });

  it("normalizes fixture factory failures without exposing their message", async () => {
    const fixtureFactory = () => {
      throw new Error("sensitive synthetic canary");
    };

    const result = await new DemoModelClient(fixtureFactory).generateStructured(makeRequest());

    expect(result).toEqual({
      kind: "malformed-output",
      safeErrorCode: "PROVIDER_MALFORMED_OUTPUT",
    });
    expect(JSON.stringify(result)).not.toContain("sensitive synthetic canary");
  });
});

describe("OpenAI provider normalization with an isolated SDK mock", () => {
  it("constructs a dormant adapter only when optional Live configuration is complete", () => {
    const client = createOpenAiModelClient(
      parseServerConfig({
        NODE_ENV: "test",
        OPENAI_API_KEY: "not-a-credential",
        OPENAI_MODEL: "configured-model-reference",
      }),
    );

    expect(client).toBeInstanceOf(OpenAiModelClient);
    expect(sdkMocks.constructorOptions).toHaveBeenCalledWith({
      apiKey: "not-a-credential",
      maxRetries: 2,
    });
    expect(sdkMocks.responsesCreate).not.toHaveBeenCalled();
  });

  it("maps a structured response and token usage without making a network call", async () => {
    sdkMocks.responsesCreate.mockResolvedValue({
      id: "synthetic-request-id",
      output_text: '{"label":"validated"}',
      usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
    });
    const controller = new AbortController();
    const client = new OpenAiModelClient({
      apiKey: "unit-test-placeholder",
      maxRetries: 0,
      model: "synthetic-model-reference",
    });

    await expect(
      client.generateStructured(makeRequest({ abortSignal: controller.signal })),
    ).resolves.toEqual({
      kind: "success",
      output: { label: "validated" },
      providerRequestId: "synthetic-request-id",
      usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
    });
    expect(sdkMocks.constructorOptions).toHaveBeenCalledWith({
      apiKey: "unit-test-placeholder",
      maxRetries: 0,
    });
    expect(sdkMocks.responsesCreate).toHaveBeenCalledWith(
      {
        input: "Synthetic fixture input",
        instructions: "Return the requested JSON object.",
        max_output_tokens: 256,
        model: "synthetic-model-reference",
      },
      { signal: controller.signal, timeout: 2_500 },
    );
  });

  it("omits usage when the provider response does not include it", async () => {
    sdkMocks.responsesCreate.mockResolvedValue({
      id: "synthetic-request-id",
      output_text: '{"label":"validated"}',
    });

    await expect(
      new OpenAiModelClient({
        apiKey: "unit-test-placeholder",
        model: "synthetic-model-reference",
      }).generateStructured(makeRequest()),
    ).resolves.toEqual({
      kind: "success",
      output: { label: "validated" },
      providerRequestId: "synthetic-request-id",
    });
  });

  it.each([
    ["not JSON", undefined],
    ['{"unexpected":true}', { input_tokens: 2, output_tokens: 3, total_tokens: 5 }],
  ] as const)(
    "normalizes malformed structured output while preserving safe usage (%s)",
    async (outputText, usage) => {
      sdkMocks.responsesCreate.mockResolvedValue({
        id: "synthetic-request-id",
        output_text: outputText,
        ...(usage === undefined ? {} : { usage }),
      });

      const result = await new OpenAiModelClient({
        apiKey: "unit-test-placeholder",
        model: "synthetic-model-reference",
      }).generateStructured(makeRequest());

      expect(result).toEqual({
        kind: "malformed-output",
        safeErrorCode: "PROVIDER_MALFORMED_OUTPUT",
        ...(usage === undefined
          ? {}
          : { usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 } }),
      });
    },
  );

  it.each([
    [401, false, "PROVIDER_AUTHORIZATION_FAILED"],
    [403, false, "PROVIDER_AUTHORIZATION_FAILED"],
    [408, true, "PROVIDER_TIMEOUT"],
    [409, true, "PROVIDER_REQUEST_REJECTED"],
    [429, true, "PROVIDER_RATE_LIMITED"],
    [500, true, "PROVIDER_UNAVAILABLE"],
    [422, false, "PROVIDER_REQUEST_REJECTED"],
  ] as const)(
    "maps provider status %s to retryable=%s and code %s",
    async (status, retryable, safeErrorCode) => {
      sdkMocks.responsesCreate.mockRejectedValue(
        new OpenAI.APIError(status, {}, undefined, new Headers()),
      );

      await expect(
        new OpenAiModelClient({
          apiKey: "unit-test-placeholder",
          model: "synthetic-model-reference",
        }).generateStructured(makeRequest()),
      ).resolves.toEqual({ kind: "provider-error", retryable, safeErrorCode });
    },
  );

  it("normalizes unknown transport failures to a retryable safe code", async () => {
    sdkMocks.responsesCreate.mockRejectedValue(new Error("synthetic transport canary"));

    const result = await new OpenAiModelClient({
      apiKey: "unit-test-placeholder",
      model: "synthetic-model-reference",
    }).generateStructured(makeRequest());

    expect(result).toEqual({
      kind: "provider-error",
      retryable: true,
      safeErrorCode: "PROVIDER_UNAVAILABLE",
    });
    expect(JSON.stringify(result)).not.toContain("synthetic transport canary");
  });
});
