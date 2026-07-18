import {
  type AgentProfile,
  type AgentRevision,
  createAgentProfile,
  createAgentRevision,
  DEFAULT_OPERATIONAL_CONTROLS_INPUT,
} from "@/modules/agent-catalog/domain";
import { type AuditRun, createAuditRun } from "@/modules/auditing/domain";
import { type Fingerprint, fingerprint, utcTimestamp, versionIdentifier } from "@/shared/domain";
import { Sha256FingerprintService } from "@/shared/infrastructure/runtime";

export const persistenceFingerprints = new Sha256FingerprintService();
export const BASE_TIME = utcTimestamp("2026-07-18T08:00:00.000Z");

export interface PersistedAgentFixture {
  readonly profile: AgentProfile;
  readonly revision: AgentRevision;
}

export function makePersistedAgentFixture(suffix = "1"): PersistedAgentFixture {
  const profile = createAgentProfile({
    createdAt: BASE_TIME,
    description: "An isolated persistence integration fixture.",
    id: `agent_profile_${suffix}`,
    name: `Integration Agent ${suffix}`,
  });
  const revision = makePersistedRevision(profile, {
    idSuffix: `${suffix}_1`,
    revisionNumber: 1,
    systemPrompt: "Follow the declared synthetic record boundary.",
  });
  return { profile, revision };
}

export function makePersistedRevision(
  profile: AgentProfile,
  options: {
    readonly idSuffix: string;
    readonly revisionNumber: number;
    readonly sourceRevisionId?: string;
    readonly systemPrompt: string;
  },
): AgentRevision {
  return createAgentRevision(
    {
      agentProfileId: profile.id,
      contentScanStatus: "CLEAR",
      contentScanVersion: "1.0.0",
      createdAt: utcTimestamp(
        `2026-07-18T08:${String(options.revisionNumber).padStart(2, "0")}:00.000Z`,
      ),
      creationSource: "USER",
      definitionSchemaVersion: "1.0.0",
      id: `agent_revision_${options.idSuffix}`,
      operationalControls: DEFAULT_OPERATIONAL_CONTROLS_INPUT,
      permissions: [
        {
          capabilityKey: "records.read",
          conditions: {
            allowedOperations: ["read"],
            maximumSensitivity: "SYNTHETIC",
            requiresUserIntent: true,
          },
          effect: "ALLOW",
          id: `permission_${options.idSuffix}`,
          requiresConfirmation: false,
          resourceType: "synthetic_record",
          scope: { allSyntheticResources: false, resourceIds: ["record_1"] },
          scopeSchemaVersion: "1.0.0",
          toolDefinitionId: `tool_${options.idSuffix}`,
        },
      ],
      revisionNumber: options.revisionNumber,
      safeBehaviorNotes: "Refuse requests outside the declared synthetic scope.",
      ...(options.sourceRevisionId === undefined
        ? {}
        : { sourceRevisionId: options.sourceRevisionId }),
      systemPrompt: options.systemPrompt,
      tools: [
        {
          capability: {
            dataSensitivity: "SYNTHETIC",
            destructive: false,
            impact: "MEDIUM",
            key: "records.read",
          },
          description: "Read one record from the deterministic fixture.",
          displayName: "Read record",
          id: `tool_${options.idSuffix}`,
          inputSchema: {
            additionalProperties: false,
            properties: {
              record_id: { maxLength: 64, minLength: 1, type: "string" },
            },
            required: ["record_id"],
            type: "object",
          },
          name: "records_read",
          schemaVersion: "1.0.0",
          simulatorConfig: { fixtureId: "support_records" },
          simulatorId: "synthetic_records",
        },
      ],
    },
    persistenceFingerprints,
  );
}

export function makePersistedAuditRun(
  revision: AgentRevision,
  options: {
    readonly id: string;
    readonly idempotencyKey: string;
  },
): AuditRun {
  return createAuditRun({
    agentRevisionFingerprint: revision.fingerprint,
    agentRevisionId: revision.id,
    budget: {
      maxCases: 12,
      maxDurationMs: 60_000,
      maxModelOutputTokensPerCase: 2_000,
      maxStepsPerCase: 8,
      maxToolAttemptsPerCase: 4,
    },
    createdAt: utcTimestamp("2026-07-18T09:00:00.000Z"),
    engineVersion: versionIdentifier("0.1.0"),
    evaluationPolicyVersion: versionIdentifier("1.0.0"),
    fixtureVersion: versionIdentifier("1.0.0"),
    id: options.id,
    idempotencyKey: options.idempotencyKey,
    mode: "DEMO",
    runPurpose: "BASELINE",
    scoringPolicyVersion: versionIdentifier("1.0.0"),
    seed: `integration:${options.idempotencyKey}`,
    taxonomyVersion: versionIdentifier("1.0.0"),
  });
}

export function requestFingerprint(value = "integration-audit-request"): Fingerprint {
  return fingerprint(`sha256:${persistenceFingerprints.sha256(value).slice("sha256:".length)}`);
}
