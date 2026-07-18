import { describe, expect, it } from "vitest";

import { parseServerConfig, toPublicConfig } from "@/shared/infrastructure/config/server-config";

describe("server configuration", () => {
  it("starts in keyless Demo Mode", () => {
    const config = parseServerConfig({ NODE_ENV: "test" });
    expect(config.openAi).toBeUndefined();
    expect(config.preferredProvider).toBe("demo");
    expect(config.databaseUrl).toBe("file:./prisma/dev.db");
  });

  it("never projects server secrets", () => {
    const canary = "sk-proj-never-return-this-value";
    const config = parseServerConfig({
      NODE_ENV: "test",
      OPENAI_API_KEY: canary,
      OPENAI_MODEL: "configured-model",
    });

    const serialized = JSON.stringify(toPublicConfig(config, "local-mutation-token"));
    expect(serialized).not.toContain(canary);
    expect(serialized).not.toContain("configured-model");
    expect(serialized).toContain('"liveModeConfigured":true');
  });

  it("rejects partial Live Mode configuration", () => {
    expect(() => parseServerConfig({ OPENAI_API_KEY: "sk-proj-incomplete" })).toThrow();
  });
});
