import { describe, expect, it } from "vitest";
import { z } from "zod";

import { ApplicationError } from "@/shared/application/errors";
import { parseServerConfig } from "@/shared/infrastructure/config/server-config";
import { DemoModelClient } from "@/shared/infrastructure/providers/demo-model-client";
import { createOpenAiModelClient } from "@/shared/infrastructure/providers/openai-model-client";

const outputSchema = z.object({ label: z.string() }).strict();

describe("model client contracts", () => {
  it("returns validated deterministic Demo output without network access", async () => {
    const client = new DemoModelClient(() => ({ label: "synthetic" }));
    await expect(
      client.generateStructured({
        input: "synthetic input",
        instructions: "Return a fixture",
        outputBudget: 100,
        purpose: "SURFACE_ANALYSIS",
        timeoutMs: 100,
        validate: (value) => outputSchema.parse(value),
      }),
    ).resolves.toEqual({ kind: "success", output: { label: "synthetic" } });
  });

  it("normalizes malformed Demo fixtures", async () => {
    const client = new DemoModelClient(() => ({ unexpected: true }));
    await expect(
      client.generateStructured({
        input: "synthetic input",
        instructions: "Return a fixture",
        outputBudget: 100,
        purpose: "TEST_PLANNING",
        timeoutMs: 100,
        validate: (value) => outputSchema.parse(value),
      }),
    ).resolves.toMatchObject({ kind: "malformed-output" });
  });

  it("keeps Live Mode unavailable when no key is configured", () => {
    const config = parseServerConfig({ NODE_ENV: "test" });
    expect(() => createOpenAiModelClient(config)).toThrow(ApplicationError);
  });
});
