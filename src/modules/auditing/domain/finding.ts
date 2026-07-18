import {
  deepFreeze,
  type Fingerprint,
  fingerprintCanonical,
  type FingerprintService,
  InvariantViolation,
  type UtcTimestamp,
  ValidationError,
  type VersionIdentifier,
  versionIdentifier,
} from "../../../shared/domain";
import type { CapabilityKey } from "../../agent-catalog/domain";
import {
  type AuditRunId,
  auditRunId,
  type EvidenceRecordId,
  evidenceRecordId,
  type FindingId,
  findingId,
  type TestExecutionId,
  testExecutionId,
} from "./ids";
import {
  type Confidence,
  type RiskCategory,
  riskCategory,
  type ScoreDimension,
  type Severity,
  type StableTestKey,
  stableTestKey,
} from "./taxonomy";

export const FINDING_AFFECTED_TEST_KEYS_SCHEMA_VERSION = versionIdentifier("1.0.0");
export const FINDING_CAPABILITY_KEYS_SCHEMA_VERSION = versionIdentifier("1.0.0");

export interface FindingEvidenceReference {
  readonly evidenceRecordId: EvidenceRecordId;
  readonly testExecutionId?: TestExecutionId;
}

export interface Finding {
  readonly id: FindingId;
  readonly auditRunId: AuditRunId;
  readonly fingerprint: Fingerprint;
  readonly evaluationPolicyVersion: VersionIdentifier;
  readonly failureMechanism: string;
  readonly category: RiskCategory;
  readonly primaryDimension: ScoreDimension;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly title: string;
  readonly description: string;
  readonly impact: string;
  readonly recommendation: string;
  readonly evidenceReferences: readonly FindingEvidenceReference[];
  readonly affectedTestKeys: readonly StableTestKey[];
  readonly affectedTestKeysSchemaVersion: VersionIdentifier;
  readonly relevantCapabilityKeys: readonly CapabilityKey[];
  readonly capabilityKeysSchemaVersion: VersionIdentifier;
  readonly createdAt: UtcTimestamp;
}

export interface CreateFindingInput {
  readonly id: string;
  readonly auditRunId: string;
  readonly evaluationPolicyVersion: VersionIdentifier;
  readonly failureMechanism: string;
  readonly category: string;
  readonly primaryDimension: ScoreDimension;
  readonly severity: Severity;
  readonly confidence: Confidence;
  readonly title: string;
  readonly description: string;
  readonly impact: string;
  readonly recommendation: string;
  readonly evidenceReferences: readonly {
    readonly evidenceRecordId: string;
    readonly testExecutionId?: string;
  }[];
  readonly affectedTestKeys: readonly string[];
  readonly relevantCapabilityKeys: readonly CapabilityKey[];
  readonly createdAt: UtcTimestamp;
}

function boundedText(value: string, field: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new ValidationError(`${field} must contain 1 to ${maximum} characters.`, field);
  }
  return normalized;
}

export function createFinding(input: CreateFindingInput, service: FingerprintService): Finding {
  if (input.evidenceReferences.length === 0) {
    throw new InvariantViolation("A finding requires at least one evidence record.");
  }
  if (input.evidenceReferences.every((reference) => reference.testExecutionId === undefined)) {
    throw new InvariantViolation(
      "At least one finding evidence record must be backed by a test execution.",
    );
  }

  const evidenceReferences = input.evidenceReferences.map((reference) => ({
    evidenceRecordId: evidenceRecordId(reference.evidenceRecordId),
    ...(reference.testExecutionId === undefined
      ? {}
      : { testExecutionId: testExecutionId(reference.testExecutionId) }),
  }));
  if (
    new Set(evidenceReferences.map((reference) => reference.evidenceRecordId)).size !==
    evidenceReferences.length
  ) {
    throw new ValidationError("Finding evidence references must be unique.", "evidenceReferences");
  }

  const category = riskCategory(input.category);
  const failureMechanism = boundedText(input.failureMechanism, "failureMechanism", 300)
    .normalize("NFKC")
    .toLowerCase();
  const affectedTestKeys = [...new Set(input.affectedTestKeys.map(stableTestKey))];
  if (affectedTestKeys.length === 0) {
    throw new InvariantViolation("A finding requires at least one affected test key.");
  }
  const relevantCapabilityKeys = [...new Set(input.relevantCapabilityKeys)].sort();
  const fingerprint = fingerprintCanonical(
    {
      category,
      capabilityKeysSchemaVersion: FINDING_CAPABILITY_KEYS_SCHEMA_VERSION,
      evaluationPolicyVersion: input.evaluationPolicyVersion,
      failureMechanism,
      relevantCapabilityKeys,
    },
    service,
  );

  return deepFreeze({
    affectedTestKeys,
    affectedTestKeysSchemaVersion: FINDING_AFFECTED_TEST_KEYS_SCHEMA_VERSION,
    auditRunId: auditRunId(input.auditRunId),
    category,
    capabilityKeysSchemaVersion: FINDING_CAPABILITY_KEYS_SCHEMA_VERSION,
    confidence: input.confidence,
    createdAt: input.createdAt,
    description: boundedText(input.description, "description", 5_000),
    evidenceReferences,
    evaluationPolicyVersion: input.evaluationPolicyVersion,
    failureMechanism,
    fingerprint,
    id: findingId(input.id),
    impact: boundedText(input.impact, "impact", 2_000),
    primaryDimension: input.primaryDimension,
    recommendation: boundedText(input.recommendation, "recommendation", 3_000),
    relevantCapabilityKeys,
    severity: input.severity,
    title: boundedText(input.title, "title", 200),
  });
}
