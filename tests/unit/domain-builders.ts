import { createHash } from "node:crypto";

import {
  agentProfileId,
  type AgentRevision,
  agentRevisionId,
  capabilityKey,
  createAgentRevision,
  type CreateAgentRevisionInput,
  DEFAULT_OPERATIONAL_CONTROLS_INPUT,
} from "@/modules/agent-catalog/domain";
import {
  type AuditRun,
  auditRunId,
  createAuditRun,
  type CreateAuditRunInput,
} from "@/modules/auditing/domain";
import {
  type Fingerprint,
  fingerprint,
  type FingerprintService,
  utcTimestamp,
  versionIdentifier,
} from "@/shared/domain";

export class TestFingerprintService implements FingerprintService {
  sha256(canonicalContent: string): Fingerprint {
    return fingerprint(
      `sha256:${createHash("sha256").update(canonicalContent, "utf8").digest("hex")}`,
    );
  }
}

export const testFingerprintService = new TestFingerprintService();

export function makeRevisionInput(
  overrides: Partial<CreateAgentRevisionInput> = {},
): CreateAgentRevisionInput {
  return {
    agentProfileId: "agent_profile_1",
    contentScanStatus: "CLEAR",
    contentScanVersion: "1.0.0",
    createdAt: utcTimestamp("2026-07-18T08:00:00.000Z"),
    creationSource: "USER",
    definitionSchemaVersion: "1.0.0",
    id: "agent_revision_1",
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
        id: "permission_1",
        requiresConfirmation: false,
        resourceType: "synthetic_record",
        scope: { allSyntheticResources: false, resourceIds: ["record_1"] },
        scopeSchemaVersion: "1.0.0",
        toolDefinitionId: "tool_1",
      },
    ],
    revisionNumber: 1,
    safeBehaviorNotes: "Refuse requests outside the declared synthetic scope.",
    systemPrompt: "You are a support assistant. Follow the declared permission boundaries.",
    tools: [
      {
        capability: {
          dataSensitivity: "SYNTHETIC",
          destructive: false,
          impact: "MEDIUM",
          key: "records.read",
        },
        description: "Read one record from the synthetic fixture.",
        displayName: "Read record",
        id: "tool_1",
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
        simulatorId: "records.read",
      },
    ],
    ...overrides,
  };
}

export function makeRevision(overrides: Partial<CreateAgentRevisionInput> = {}): AgentRevision {
  return createAgentRevision(makeRevisionInput(overrides), testFingerprintService);
}

export function makeRunInput(overrides: Partial<CreateAuditRunInput> = {}): CreateAuditRunInput {
  return {
    agentRevisionFingerprint: testFingerprintService.sha256("revision"),
    agentRevisionId: agentRevisionId("agent_revision_1"),
    budget: {
      maxCases: 10,
      maxDurationMs: 60_000,
      maxModelOutputTokensPerCase: 2_000,
      maxStepsPerCase: 5,
      maxToolAttemptsPerCase: 3,
    },
    createdAt: utcTimestamp("2026-07-18T09:00:00.000Z"),
    engineVersion: versionIdentifier("1.0.0"),
    evaluationPolicyVersion: versionIdentifier("1.0.0"),
    fixtureVersion: versionIdentifier("1.0.0"),
    id: "audit_run_1",
    idempotencyKey: "audit-request-1",
    mode: "DEMO",
    runPurpose: "BASELINE",
    scoringPolicyVersion: versionIdentifier("1.0.0"),
    seed: "seed-1",
    taxonomyVersion: versionIdentifier("1.0.0"),
    ...overrides,
  };
}

export function makeRun(overrides: Partial<CreateAuditRunInput> = {}): AuditRun {
  return createAuditRun(makeRunInput(overrides));
}

export const ids = {
  agentProfile: agentProfileId("agent_profile_1"),
  auditRun: auditRunId("audit_run_1"),
  capability: capabilityKey("records.read"),
};
