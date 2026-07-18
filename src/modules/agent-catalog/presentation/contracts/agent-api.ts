import { z } from "zod";

const identifier = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z][A-Za-z0-9._ -]*$/u, "Use a descriptive identifier without paths or code.");

const capabilitySchema = z
  .object({
    dataSensitivity: z.enum(["CONFIDENTIAL", "PUBLIC", "RESTRICTED", "SYNTHETIC"]),
    destructive: z.boolean(),
    impact: z.enum(["CRITICAL", "HIGH", "LOW", "MEDIUM"]),
    key: identifier,
  })
  .strict();

export const toolDefinitionRequestSchema = z
  .object({
    capability: capabilitySchema,
    description: z.string().trim().min(1).max(2_000),
    displayName: z.string().trim().min(1).max(120).optional(),
    inputSchema: z.unknown(),
    name: identifier,
    schemaVersion: z.string().trim().default("1.0.0"),
    simulatorConfig: z
      .object({
        fixtureId: identifier.optional(),
        scenarioId: identifier.optional(),
        variant: identifier.optional(),
      })
      .strict()
      .default({}),
    simulatorId: identifier,
  })
  .strict();

export const permissionGrantRequestSchema = z
  .object({
    capabilityKey: identifier,
    conditions: z
      .object({
        allowedOperations: z.array(identifier).max(100).optional(),
        maximumSensitivity: z
          .enum(["CONFIDENTIAL", "PUBLIC", "RESTRICTED", "SYNTHETIC"])
          .optional(),
        requiresUserIntent: z.boolean().optional(),
      })
      .strict()
      .default({}),
    effect: z.enum(["ALLOW", "DENY"]),
    requiresConfirmation: z.boolean().default(false),
    resourceType: identifier,
    scope: z
      .object({
        allSyntheticResources: z.boolean(),
        resourceIds: z.array(identifier).max(100).optional(),
      })
      .strict(),
    scopeSchemaVersion: z.string().trim().default("1.0.0"),
    toolName: identifier.optional(),
  })
  .strict();

export const operationalControlsRequestSchema = z
  .object({
    confirmationRequiredFor: z.array(identifier).max(128).default([]),
    escalationRequiredFor: z.array(identifier).max(128).default([]),
    evidenceRequirements: z
      .array(
        z.enum([
          "ASSERTION_RESULTS",
          "PERMISSION_DECISIONS",
          "SIMULATOR_OUTCOMES",
          "TOOL_ATTEMPTS",
        ]),
      )
      .max(4)
      .default(["ASSERTION_RESULTS", "PERMISSION_DECISIONS", "TOOL_ATTEMPTS"]),
    maxRetries: z.number().int().min(0).max(3).default(0),
    schemaVersion: z.string().trim().default("1.0.0"),
    stopConditions: z
      .array(
        z.enum([
          "ON_AMBIGUOUS_INTENT",
          "ON_BUDGET_EXHAUSTED",
          "ON_PERMISSION_DENIAL",
          "ON_SIMULATOR_ERROR",
        ]),
      )
      .max(4)
      .default(["ON_BUDGET_EXHAUSTED", "ON_PERMISSION_DENIAL", "ON_SIMULATOR_ERROR"]),
  })
  .strict()
  .default({
    confirmationRequiredFor: [],
    escalationRequiredFor: [],
    evidenceRequirements: ["ASSERTION_RESULTS", "PERMISSION_DECISIONS", "TOOL_ATTEMPTS"],
    maxRetries: 0,
    schemaVersion: "1.0.0",
    stopConditions: ["ON_BUDGET_EXHAUSTED", "ON_PERMISSION_DENIAL", "ON_SIMULATOR_ERROR"],
  });

export const agentDefinitionRequestSchema = z
  .object({
    operationalControls: operationalControlsRequestSchema,
    permissions: z.array(permissionGrantRequestSchema).max(128).default([]),
    safeBehaviorNotes: z.string().trim().max(8_000).default(""),
    systemPrompt: z.string().trim().min(1).max(64_000),
    tools: z.array(toolDefinitionRequestSchema).max(32).default([]),
  })
  .strict();

export const createAgentRequestSchema = z
  .object({
    definition: agentDefinitionRequestSchema,
    description: z.string().trim().max(2_000).default(""),
    name: z.string().trim().min(1).max(120),
  })
  .strict();

export const createAgentRevisionRequestSchema = agentDefinitionRequestSchema;

export const agentIdParameterSchema = z.string().trim().min(1).max(128);

export type AgentDefinitionRequest = z.output<typeof agentDefinitionRequestSchema>;
export type CreateAgentRequest = z.output<typeof createAgentRequestSchema>;
export type CreateAgentRevisionRequest = z.output<typeof createAgentRevisionRequestSchema>;
