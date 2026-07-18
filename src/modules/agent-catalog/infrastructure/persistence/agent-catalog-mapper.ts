import { z } from "zod";

import type {
  AgentProfile as AgentProfileRecord,
  AgentRevision as AgentRevisionRecord,
  PermissionGrant as PermissionGrantRecord,
  Prisma,
  ToolDefinition as ToolDefinitionRecord,
} from "@/generated/prisma/client";
import {
  type AgentProfile,
  agentProfileId,
  type AgentRevision,
  createAgentRevision,
} from "@/modules/agent-catalog/domain";
import {
  canonicalSerialize,
  deepFreeze,
  type FingerprintService,
  InvariantViolation,
  utcTimestamp,
} from "@/shared/domain";
import {
  parseCanonicalJsonColumn as parseCanonicalUnknown,
  parseCanonicalJsonColumnWithSchema as parseCanonicalJson,
} from "@/shared/infrastructure/persistence";

export type PersistedAgentRevisionGraph = AgentRevisionRecord & {
  readonly permissionGrants: readonly PermissionGrantRecord[];
  readonly tools: readonly ToolDefinitionRecord[];
};

export interface PersistedAgentRevisionCreateGraph {
  readonly permissionGrants: readonly Prisma.PermissionGrantUncheckedCreateInput[];
  readonly revision: Prisma.AgentRevisionUncheckedCreateInput;
  readonly tools: readonly Prisma.ToolDefinitionUncheckedCreateInput[];
}

const operationalControlsSchema = z.strictObject({
  confirmationRequiredFor: z.array(z.string()),
  escalationRequiredFor: z.array(z.string()),
  evidenceRequirements: z.array(
    z.enum(["ASSERTION_RESULTS", "PERMISSION_DECISIONS", "SIMULATOR_OUTCOMES", "TOOL_ATTEMPTS"]),
  ),
  maxRetries: z.number().int(),
  schemaVersion: z.string(),
  stopConditions: z.array(
    z.enum([
      "ON_AMBIGUOUS_INTENT",
      "ON_BUDGET_EXHAUSTED",
      "ON_PERMISSION_DENIAL",
      "ON_SIMULATOR_ERROR",
    ]),
  ),
});

const simulatorConfigSchema = z.strictObject({
  fixtureId: z.string().optional(),
  scenarioId: z.string().optional(),
  variant: z.string().optional(),
});

const resourceScopeSchema = z.strictObject({
  allSyntheticResources: z.boolean(),
  resourceIds: z.array(z.string()).optional(),
});

const permissionConditionsSchema = z.strictObject({
  allowedOperations: z.array(z.string()).optional(),
  maximumSensitivity: z.enum(["CONFIDENTIAL", "PUBLIC", "RESTRICTED", "SYNTHETIC"]).optional(),
  requiresUserIntent: z.boolean().optional(),
});

function dataIntegrityError(subject: string, cause?: unknown): InvariantViolation {
  return new InvariantViolation(
    `Persisted ${subject} failed integrity validation.`,
    cause === undefined ? undefined : { cause },
  );
}

function assertContiguousOrdinals(
  values: readonly { readonly ordinal: number }[],
  subject: string,
): void {
  for (const [expected, value] of values.entries()) {
    if (value.ordinal !== expected) {
      throw dataIntegrityError(`${subject} ordering`);
    }
  }
}

export function normalizeAgentProfileNameForSearch(name: string): string {
  return name.trim().replace(/\s+/gu, " ").normalize("NFKC").toLowerCase();
}

export function mapAgentProfileRecord(record: AgentProfileRecord): AgentProfile {
  if (
    record.recordVersion < 1 ||
    normalizeAgentProfileNameForSearch(record.name) !== record.normalizedName
  ) {
    throw dataIntegrityError("agent profile");
  }

  return deepFreeze({
    createdAt: utcTimestamp(record.createdAt),
    description: record.description,
    id: agentProfileId(record.id),
    name: record.name,
    recordVersion: record.recordVersion,
    updatedAt: utcTimestamp(record.updatedAt),
    ...(record.archivedAt === null ? {} : { archivedAt: utcTimestamp(record.archivedAt) }),
  });
}

export function mapAgentProfileCreateData(
  profile: AgentProfile,
): Prisma.AgentProfileUncheckedCreateInput {
  return {
    archivedAt: profile.archivedAt === undefined ? null : new Date(profile.archivedAt),
    createdAt: new Date(profile.createdAt),
    description: profile.description,
    id: profile.id,
    name: profile.name,
    normalizedName: normalizeAgentProfileNameForSearch(profile.name),
    recordVersion: profile.recordVersion,
    updatedAt: new Date(profile.updatedAt),
  };
}

export function mapAgentRevisionCreateGraph(
  revision: AgentRevision,
): PersistedAgentRevisionCreateGraph {
  const tools = revision.tools.map((tool): Prisma.ToolDefinitionUncheckedCreateInput => ({
    agentRevisionId: revision.id,
    capabilityDataSensitivity: tool.capability.dataSensitivity,
    capabilityDestructive: tool.capability.destructive,
    capabilityImpact: tool.capability.impact,
    capabilityKey: tool.capability.key,
    description: tool.description,
    displayName: tool.displayName,
    fingerprint: tool.fingerprint,
    id: tool.id,
    inputSchemaJson: canonicalSerialize(tool.inputSchema),
    name: tool.name,
    ordinal: tool.ordinal,
    schemaVersion: tool.schemaVersion,
    simulatorConfigJson: canonicalSerialize(tool.simulatorConfig),
    simulatorConfigSchemaVersion: tool.schemaVersion,
    simulatorId: tool.simulatorId,
  }));

  const permissionGrants = revision.permissions.map(
    (permission): Prisma.PermissionGrantUncheckedCreateInput => ({
      agentRevisionId: revision.id,
      capabilityKey: permission.capabilityKey,
      conditionsJson: canonicalSerialize(permission.conditions),
      conditionsSchemaVersion: permission.scopeSchemaVersion,
      effect: permission.effect,
      fingerprint: permission.fingerprint,
      id: permission.id,
      ordinal: permission.ordinal,
      requiresConfirmation: permission.requiresConfirmation,
      resourceType: permission.resourceType,
      scopeJson: canonicalSerialize(permission.scope),
      scopeSchemaVersion: permission.scopeSchemaVersion,
      toolDefinitionId: permission.toolDefinitionId ?? null,
    }),
  );

  return {
    permissionGrants,
    revision: {
      agentProfileId: revision.agentProfileId,
      contentScanStatus: revision.contentScanStatus,
      contentScanVersion: revision.contentScanVersion,
      createdAt: new Date(revision.createdAt),
      creationSource: revision.creationSource,
      definitionSchemaVersion: revision.definitionSchemaVersion,
      fingerprint: revision.fingerprint,
      id: revision.id,
      operationalControlsJson: canonicalSerialize(revision.operationalControls),
      operationalControlsSchemaVersion: revision.operationalControls.schemaVersion,
      revisionNumber: revision.revisionNumber,
      safeBehaviorNotes: revision.safeBehaviorNotes,
      secretWarningAcknowledgedAt:
        revision.secretWarningAcknowledgedAt === undefined
          ? null
          : new Date(revision.secretWarningAcknowledgedAt),
      sourceRevisionId: revision.sourceRevisionId ?? null,
      systemPrompt: revision.systemPrompt,
    },
    tools,
  };
}

export function mapAgentRevisionRecord(
  record: PersistedAgentRevisionGraph,
  fingerprintService: FingerprintService,
): AgentRevision {
  const tools = [...record.tools].sort((left, right) => left.ordinal - right.ordinal);
  const permissions = [...record.permissionGrants].sort(
    (left, right) => left.ordinal - right.ordinal,
  );
  assertContiguousOrdinals(tools, "tool definitions");
  assertContiguousOrdinals(permissions, "permission grants");
  if (
    tools.some((tool) => tool.simulatorConfigSchemaVersion !== tool.schemaVersion) ||
    permissions.some(
      (permission) => permission.conditionsSchemaVersion !== permission.scopeSchemaVersion,
    )
  ) {
    throw dataIntegrityError("agent definition JSON schema versions");
  }

  const operationalControls = parseCanonicalJson(
    record.operationalControlsJson,
    "operational controls",
    operationalControlsSchema,
  );
  if (operationalControls.schemaVersion !== record.operationalControlsSchemaVersion) {
    throw dataIntegrityError("operational controls schema version");
  }

  const rebuilt = createAgentRevision(
    {
      agentProfileId: record.agentProfileId,
      contentScanStatus:
        record.contentScanStatus === "CLEAR" || record.contentScanStatus === "WARNING_ACKNOWLEDGED"
          ? record.contentScanStatus
          : (() => {
              throw dataIntegrityError("content scan status");
            })(),
      contentScanVersion: record.contentScanVersion,
      createdAt: utcTimestamp(record.createdAt),
      creationSource:
        record.creationSource === "USER" ||
        record.creationSource === "GUARDRAIL" ||
        record.creationSource === "SYNTHETIC_SEED"
          ? record.creationSource
          : (() => {
              throw dataIntegrityError("revision creation source");
            })(),
      definitionSchemaVersion: record.definitionSchemaVersion,
      id: record.id,
      operationalControls,
      permissions: permissions.map((permission) => ({
        capabilityKey: permission.capabilityKey,
        conditions: parseCanonicalJson(
          permission.conditionsJson,
          "permission conditions",
          permissionConditionsSchema,
        ),
        effect:
          permission.effect === "ALLOW" || permission.effect === "DENY"
            ? permission.effect
            : (() => {
                throw dataIntegrityError("permission effect");
              })(),
        id: permission.id,
        requiresConfirmation: permission.requiresConfirmation,
        resourceType: permission.resourceType,
        scope: parseCanonicalJson(permission.scopeJson, "permission scope", resourceScopeSchema),
        scopeSchemaVersion: permission.scopeSchemaVersion,
        ...(permission.toolDefinitionId === null
          ? {}
          : { toolDefinitionId: permission.toolDefinitionId }),
      })),
      revisionNumber: record.revisionNumber,
      safeBehaviorNotes: record.safeBehaviorNotes,
      ...(record.secretWarningAcknowledgedAt === null
        ? {}
        : {
            secretWarningAcknowledgedAt: utcTimestamp(record.secretWarningAcknowledgedAt),
          }),
      ...(record.sourceRevisionId === null ? {} : { sourceRevisionId: record.sourceRevisionId }),
      systemPrompt: record.systemPrompt,
      tools: tools.map((tool) => ({
        capability: {
          dataSensitivity:
            tool.capabilityDataSensitivity === "CONFIDENTIAL" ||
            tool.capabilityDataSensitivity === "PUBLIC" ||
            tool.capabilityDataSensitivity === "RESTRICTED" ||
            tool.capabilityDataSensitivity === "SYNTHETIC"
              ? tool.capabilityDataSensitivity
              : (() => {
                  throw dataIntegrityError("tool capability sensitivity");
                })(),
          destructive: tool.capabilityDestructive,
          impact:
            tool.capabilityImpact === "CRITICAL" ||
            tool.capabilityImpact === "HIGH" ||
            tool.capabilityImpact === "LOW" ||
            tool.capabilityImpact === "MEDIUM"
              ? tool.capabilityImpact
              : (() => {
                  throw dataIntegrityError("tool capability impact");
                })(),
          key: tool.capabilityKey,
        },
        description: tool.description,
        displayName: tool.displayName,
        id: tool.id,
        inputSchema: parseCanonicalUnknown(tool.inputSchemaJson, "tool input schema"),
        name: tool.name,
        schemaVersion: tool.schemaVersion,
        simulatorConfig: parseCanonicalJson(
          tool.simulatorConfigJson,
          "simulator configuration",
          simulatorConfigSchema,
        ),
        simulatorId: tool.simulatorId,
      })),
    },
    fingerprintService,
  );

  if (
    rebuilt.fingerprint !== record.fingerprint ||
    rebuilt.tools.some((tool, index) => tool.fingerprint !== tools[index]?.fingerprint) ||
    rebuilt.permissions.some(
      (permission, index) => permission.fingerprint !== permissions[index]?.fingerprint,
    )
  ) {
    throw dataIntegrityError("agent revision fingerprint");
  }

  return rebuilt;
}
