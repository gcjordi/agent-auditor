import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getApplicationContainer } from "@/bootstrap/container";
import { checkHealth } from "@/bootstrap/health";
import { getPublicServerCapabilities } from "@/bootstrap/public-capabilities";
import {
  parseServerConfig,
  type ServerConfig,
  toPublicConfig,
} from "@/shared/infrastructure/config/server-config";

interface HealthClient {
  $queryRaw(strings: TemplateStringsArray, ...values: readonly unknown[]): Promise<unknown>;
}

const bootstrapMocks = vi.hoisted(() => ({
  getPrismaClient: vi.fn<() => Promise<HealthClient>>(),
  getServerConfig: vi.fn<() => ServerConfig>(),
}));

vi.mock("@/bootstrap/prisma-client", () => ({
  getPrismaClient: bootstrapMocks.getPrismaClient,
}));

vi.mock("@/shared/infrastructure/config", () => ({
  getServerConfig: bootstrapMocks.getServerConfig,
}));

function serverConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    applicationVersion: "0.1.0",
    audit: {
      concurrency: 1,
      maximumDurationSeconds: 300,
      maximumTestCases: 24,
    },
    databaseUrl: "file:./prisma/test.db",
    demo: { seed: "synthetic-seed" },
    environment: "test",
    host: "127.0.0.1",
    logLevel: "info",
    port: 3000,
    preferredProvider: "demo",
    providerTimeoutMs: 30_000,
    ...overrides,
  };
}

beforeEach(() => {
  bootstrapMocks.getPrismaClient.mockReset();
  bootstrapMocks.getServerConfig.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("server configuration contract", () => {
  it("trims configuration and coerces bounded numeric values", () => {
    const config = parseServerConfig({
      APP_HOST: " 127.0.0.1 ",
      APP_PORT: "3100",
      AUDIT_CONCURRENCY: "4",
      AUDIT_MAX_DURATION_SECONDS: "90",
      AUDIT_MAX_TEST_CASES: "12",
      AUDIT_PROVIDER: "openai",
      DATABASE_URL: " file:./prisma/config-test.db ",
      DEMO_SEED: " deterministic-seed ",
      LOG_LEVEL: "debug",
      NODE_ENV: "test",
      OPENAI_API_KEY: "  ",
      OPENAI_MODEL: "  ",
      PROVIDER_TIMEOUT_MS: "4500",
    });

    expect(config).toMatchObject({
      audit: { concurrency: 4, maximumDurationSeconds: 90, maximumTestCases: 12 },
      databaseUrl: "file:./prisma/config-test.db",
      demo: { seed: "deterministic-seed" },
      environment: "test",
      host: "127.0.0.1",
      logLevel: "debug",
      port: 3100,
      preferredProvider: "openai",
      providerTimeoutMs: 4500,
    });
    expect(config.openAi).toBeUndefined();
  });

  it.each([
    ["APP_HOST", "0.0.0.0"],
    ["APP_HOST", "untrusted.invalid"],
    ["APP_PORT", "0"],
    ["APP_PORT", "65536"],
    ["AUDIT_CONCURRENCY", "5"],
    ["AUDIT_MAX_DURATION_SECONDS", "29"],
    ["AUDIT_MAX_TEST_CASES", "101"],
    ["PROVIDER_TIMEOUT_MS", "999"],
  ] as const)("rejects an out-of-range %s value", (field, value) => {
    expect(() => parseServerConfig({ [field]: value })).toThrow();
  });

  it("publishes only the local UI capability contract", () => {
    const config = parseServerConfig({
      AUDIT_MAX_TEST_CASES: "16",
      NODE_ENV: "test",
      OPENAI_API_KEY: "not-a-credential",
      OPENAI_MODEL: "configured-model-reference",
    });

    expect(toPublicConfig(config, "local-mutation-token")).toEqual({
      applicationVersion: "0.1.0",
      demoModeAvailable: true,
      liveModeConfigured: true,
      maximumCases: 16,
      mutationToken: "local-mutation-token",
    });
    expect(JSON.stringify(toPublicConfig(config, "local-mutation-token"))).not.toContain(
      "not-a-credential",
    );
  });

  it("caches the parsed process environment for one server lifetime", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATABASE_URL", "file:./prisma/cached-config.db");
    vi.resetModules();
    const configModule = await import("@/shared/infrastructure/config/server-config");

    const first = configModule.getServerConfig();
    const second = configModule.getServerConfig();

    expect(second).toBe(first);
    expect(first.databaseUrl).toBe("file:./prisma/cached-config.db");
  });
});

describe("bootstrap capability and health contracts", () => {
  it("reports keyless Demo capability without projecting internal configuration", () => {
    bootstrapMocks.getServerConfig.mockReturnValue(serverConfig());

    expect(getPublicServerCapabilities()).toEqual({
      demoModeAvailable: true,
      liveModeConfigured: false,
      maximumCases: 24,
    });
  });

  it("reports configured Live capability without projecting the credential", () => {
    bootstrapMocks.getServerConfig.mockReturnValue(
      serverConfig({
        openAi: { apiKey: "not-a-credential", model: "configured-model-reference" },
      }),
    );

    const capabilities = getPublicServerCapabilities();
    expect(capabilities.liveModeConfigured).toBe(true);
    expect(JSON.stringify(capabilities)).not.toContain("not-a-credential");
  });

  it("reports a reachable database after the health probe succeeds", async () => {
    const queryRaw = vi.fn<HealthClient["$queryRaw"]>().mockResolvedValue([{ healthy: 1 }]);
    bootstrapMocks.getPrismaClient.mockResolvedValue({ $queryRaw: queryRaw });

    await expect(checkHealth()).resolves.toEqual({ database: "reachable", status: "ok" });
    expect(queryRaw).toHaveBeenCalledOnce();
  });

  it("fails closed when database initialization or probing fails", async () => {
    bootstrapMocks.getPrismaClient.mockRejectedValue(new Error("synthetic database failure"));

    await expect(checkHealth()).resolves.toEqual({
      database: "unreachable",
      status: "degraded",
    });
  });

  it("composes and memoizes the local application container", async () => {
    const queryRaw = vi.fn<HealthClient["$queryRaw"]>().mockResolvedValue([{ healthy: 1 }]);
    bootstrapMocks.getPrismaClient.mockResolvedValue({ $queryRaw: queryRaw });
    bootstrapMocks.getServerConfig.mockReturnValue(serverConfig());

    const first = getApplicationContainer();
    const second = getApplicationContainer();
    expect(second).toBe(first);

    const container = await first;
    expect(Object.keys(container.agents).sort()).toEqual([
      "create",
      "createRevision",
      "get",
      "getRevision",
      "list",
      "purge",
    ]);
    expect(Object.keys(container.audits).sort()).toEqual([
      "cancel",
      "coordinator",
      "create",
      "get",
      "list",
      "reconcile",
    ]);
    expect(container.agents.create).toHaveProperty("execute");
    expect(container.audits.coordinator).toHaveProperty("runAvailableFoundationJobs");
    expect(container.logger).toHaveProperty("log");
    expect(bootstrapMocks.getPrismaClient).toHaveBeenCalledOnce();
  });
});
