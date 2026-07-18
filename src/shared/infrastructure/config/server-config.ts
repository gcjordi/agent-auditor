import "server-only";

import { z } from "zod";

const emptyStringToUndefined = (value: unknown): unknown =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalTrimmedString = z.preprocess(
  emptyStringToUndefined,
  z.string().trim().min(1).optional(),
);

const integerFromEnvironment = (minimum: number, maximum: number, fallback: number) =>
  z.preprocess(
    emptyStringToUndefined,
    z.coerce.number().int().min(minimum).max(maximum).default(fallback),
  );

const loopbackHost = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => value === "127.0.0.1" || value === "localhost" || value === "::1", {
    message: "APP_HOST must identify a loopback interface.",
  });

const serverEnvironmentSchema = z
  .object({
    APP_HOST: loopbackHost.default("127.0.0.1"),
    APP_PORT: integerFromEnvironment(1, 65_535, 3000),
    AUDIT_CONCURRENCY: integerFromEnvironment(1, 4, 1),
    AUDIT_MAX_DURATION_SECONDS: integerFromEnvironment(30, 3_600, 300),
    AUDIT_MAX_TEST_CASES: integerFromEnvironment(1, 100, 24),
    AUDIT_PROVIDER: z.enum(["demo", "openai"]).default("demo"),
    DATABASE_URL: z.string().trim().startsWith("file:").default("file:./prisma/dev.db"),
    DEMO_SEED: z.string().trim().min(1).max(128).default("agent-auditor-demo-v1"),
    LOG_LEVEL: z.enum(["debug", "error", "info", "warn"]).default("info"),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
    OPENAI_API_KEY: optionalTrimmedString,
    OPENAI_MODEL: optionalTrimmedString,
    PROVIDER_TIMEOUT_MS: integerFromEnvironment(1_000, 120_000, 30_000),
  })
  .superRefine((environment, context) => {
    const hasKey = environment.OPENAI_API_KEY !== undefined;
    const hasModel = environment.OPENAI_MODEL !== undefined;

    if (hasKey !== hasModel) {
      context.addIssue({
        code: "custom",
        message: "OPENAI_API_KEY and OPENAI_MODEL must either both be set or both be absent.",
        path: hasKey ? ["OPENAI_MODEL"] : ["OPENAI_API_KEY"],
      });
    }
  });

export interface ServerConfig {
  readonly applicationVersion: string;
  readonly audit: {
    readonly concurrency: number;
    readonly maximumDurationSeconds: number;
    readonly maximumTestCases: number;
  };
  readonly databaseUrl: string;
  readonly demo: {
    readonly seed: string;
  };
  readonly environment: "development" | "production" | "test";
  readonly host: string;
  readonly logLevel: "debug" | "error" | "info" | "warn";
  readonly openAi?: {
    readonly apiKey: string;
    readonly model: string;
  };
  readonly port: number;
  readonly preferredProvider: "demo" | "openai";
  readonly providerTimeoutMs: number;
}

export interface PublicConfig {
  readonly applicationVersion: string;
  readonly demoModeAvailable: true;
  readonly liveModeConfigured: boolean;
  readonly maximumCases: number;
  readonly mutationToken: string;
}

export function parseServerConfig(
  environment: Readonly<Record<string, string | undefined>>,
): ServerConfig {
  const parsed = serverEnvironmentSchema.parse(environment);
  const openAi =
    parsed.OPENAI_API_KEY !== undefined && parsed.OPENAI_MODEL !== undefined
      ? { apiKey: parsed.OPENAI_API_KEY, model: parsed.OPENAI_MODEL }
      : undefined;

  return {
    applicationVersion: "0.1.0",
    audit: {
      concurrency: parsed.AUDIT_CONCURRENCY,
      maximumDurationSeconds: parsed.AUDIT_MAX_DURATION_SECONDS,
      maximumTestCases: parsed.AUDIT_MAX_TEST_CASES,
    },
    databaseUrl: parsed.DATABASE_URL,
    demo: { seed: parsed.DEMO_SEED },
    environment: parsed.NODE_ENV,
    host: parsed.APP_HOST,
    logLevel: parsed.LOG_LEVEL,
    ...(openAi === undefined ? {} : { openAi }),
    port: parsed.APP_PORT,
    preferredProvider: parsed.AUDIT_PROVIDER,
    providerTimeoutMs: parsed.PROVIDER_TIMEOUT_MS,
  };
}

let cachedConfig: ServerConfig | undefined;

export function getServerConfig(): ServerConfig {
  cachedConfig ??= parseServerConfig(process.env);
  return cachedConfig;
}

export function toPublicConfig(config: ServerConfig, mutationToken: string): PublicConfig {
  return {
    applicationVersion: config.applicationVersion,
    demoModeAvailable: true,
    liveModeConfigured: config.openAi !== undefined,
    maximumCases: config.audit.maximumTestCases,
    mutationToken,
  };
}
