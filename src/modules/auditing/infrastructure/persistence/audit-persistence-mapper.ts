import { z } from "zod";

import type {
  AuditJob as AuditJobRecord,
  AuditRun as AuditRunRecord,
  Prisma,
} from "@/generated/prisma/client";
import { agentRevisionId } from "@/modules/agent-catalog/domain";
import type { PersistedAuditJob } from "@/modules/auditing/application/ports";
import { auditPlanId, type AuditRun, auditRunId } from "@/modules/auditing/domain";
import {
  type CanonicalJsonObject,
  canonicalSerialize,
  contentDigest,
  createEntityIdParser,
  deepFreeze,
  type Fingerprint,
  fingerprint,
  InvariantViolation,
  utcTimestamp,
  versionIdentifier,
} from "@/shared/domain";
import { parseCanonicalJsonColumnWithSchema } from "@/shared/infrastructure/persistence";

export const AUDIT_BUDGET_SCHEMA_VERSION = "1.0.0";

const auditJobIdParser = createEntityIdParser("AuditJob");

const runBudgetSchema = z.strictObject({
  maxCases: z.number().int(),
  maxDurationMs: z.number().int(),
  maxModelOutputTokensPerCase: z.number().int(),
  maxStepsPerCase: z.number().int(),
  maxToolAttemptsPerCase: z.number().int(),
});

const canonicalObjectSchema = z.custom<CanonicalJsonObject>(
  (value) => typeof value === "object" && value !== null && !Array.isArray(value),
);

const auditModeSchema = z.enum(["DEMO", "LIVE"]);
const auditPurposeSchema = z.enum(["BASELINE", "SUPPLEMENTAL", "VERIFICATION"]);
const auditStatusSchema = z.enum([
  "CANCELLED",
  "CANCELLING",
  "COMPLETED",
  "EVALUATING",
  "EXECUTING",
  "FAILED",
  "FINALIZING",
  "INTERRUPTED",
  "PLANNING",
  "QUEUED",
]);
const auditPhaseSchema = z.enum([
  "ANALYZING_SURFACE",
  "BUILDING_PLAN",
  "CALCULATING_SCORES",
  "CANCELLED",
  "CANCELLING",
  "COMPLETED",
  "CORRELATING_FINDINGS",
  "EVALUATING_RESULTS",
  "FAILED",
  "FINALIZING_RESULTS",
  "INTERRUPTED",
  "QUEUED",
  "RUNNING_TESTS",
]);
const jobStatusSchema = z.enum(["LEASED", "QUEUED", "TERMINAL", "WAITING_RETRY"]);

function dataIntegrityError(subject: string): InvariantViolation {
  return new InvariantViolation(`Persisted ${subject} failed integrity validation.`);
}

export function mapAuditRunCreateData(
  run: AuditRun,
  requestFingerprint: Fingerprint,
): Prisma.AuditRunUncheckedCreateInput {
  const live = run.liveConfiguration;
  return {
    agentRevisionFingerprint: run.agentRevisionFingerprint,
    agentRevisionId: run.agentRevisionId,
    attemptNumber: run.attemptNumber,
    auditPlanFingerprint: run.auditPlanFingerprint ?? null,
    auditPlanId: run.auditPlanId ?? null,
    baselineRunId: run.baselineRunId ?? null,
    budgetJson: canonicalSerialize(run.budget),
    budgetSchemaVersion: AUDIT_BUDGET_SCHEMA_VERSION,
    cancellationRequestedAt:
      run.cancellationRequestedAt === undefined ? null : new Date(run.cancellationRequestedAt),
    completedAt: run.completedAt === undefined ? null : new Date(run.completedAt),
    completedCaseCount: run.completedCaseCount,
    createdAt: new Date(run.createdAt),
    currentPhase: run.currentPhase,
    engineVersion: run.engineVersion,
    evaluationPolicyVersion: run.evaluationPolicyVersion,
    failureCode: run.failure?.code ?? null,
    failureSummary: run.failure?.summary ?? null,
    fixtureVersion: run.fixtureVersion,
    id: run.id,
    idempotencyKey: run.idempotencyKey,
    liveConsentAt: live === undefined ? null : new Date(live.liveConsentAt),
    liveConsentVersion: live?.liveConsentVersion ?? null,
    mode: run.mode,
    modelReference: live?.modelReference ?? null,
    modelRequestProfileDigest: live?.modelRequestProfileDigest ?? null,
    modelRequestProfileJson:
      live === undefined ? null : canonicalSerialize(live.modelRequestProfile),
    modelRequestProfileSchemaVersion: live?.modelRequestProfileSchemaVersion ?? null,
    plannedCaseCount: run.plannedCaseCount,
    recordVersion: run.recordVersion,
    requestFingerprint,
    retryOfRunId: run.retryOfRunId ?? null,
    runPurpose: run.runPurpose,
    scoringPolicyVersion: run.scoringPolicyVersion,
    seed: run.seed,
    startedAt: run.startedAt === undefined ? null : new Date(run.startedAt),
    status: run.status,
    taxonomyVersion: run.taxonomyVersion,
    transmissionSummaryDigest: live?.transmissionSummaryDigest ?? null,
    updatedAt: new Date(run.updatedAt),
  };
}

export function mapAuditRunRecord(record: AuditRunRecord): AuditRun {
  if (
    record.budgetSchemaVersion !== AUDIT_BUDGET_SCHEMA_VERSION ||
    record.plannedCaseCount < 0 ||
    record.completedCaseCount < 0 ||
    record.completedCaseCount > record.plannedCaseCount ||
    record.attemptNumber < 1 ||
    record.recordVersion < 1
  ) {
    throw dataIntegrityError("audit run");
  }
  const mode = auditModeSchema.parse(record.mode);
  const status = auditStatusSchema.parse(record.status);
  const currentPhase = auditPhaseSchema.parse(record.currentPhase);
  const runPurpose = auditPurposeSchema.parse(record.runPurpose);
  const hasFailure = record.failureCode !== null || record.failureSummary !== null;
  if (
    (record.failureCode === null) !== (record.failureSummary === null) ||
    (status === "FAILED" || status === "INTERRUPTED") !== hasFailure
  ) {
    throw dataIntegrityError("audit failure metadata");
  }

  const liveConfiguration =
    mode === "DEMO"
      ? undefined
      : {
          liveConsentAt: utcTimestamp(
            record.liveConsentAt ??
              (() => {
                throw dataIntegrityError("live consent");
              })(),
          ),
          liveConsentVersion: versionIdentifier(
            record.liveConsentVersion ??
              (() => {
                throw dataIntegrityError("live consent");
              })(),
          ),
          modelReference:
            record.modelReference ??
            (() => {
              throw dataIntegrityError("live model");
            })(),
          modelRequestProfile: parseCanonicalJsonColumnWithSchema(
            record.modelRequestProfileJson ??
              (() => {
                throw dataIntegrityError("live request profile");
              })(),
            "live request profile",
            canonicalObjectSchema,
          ),
          modelRequestProfileDigest: contentDigest(
            record.modelRequestProfileDigest ??
              (() => {
                throw dataIntegrityError("live request profile digest");
              })(),
          ),
          modelRequestProfileSchemaVersion: versionIdentifier(
            record.modelRequestProfileSchemaVersion ??
              (() => {
                throw dataIntegrityError("live request profile version");
              })(),
          ),
          transmissionSummaryDigest: contentDigest(
            record.transmissionSummaryDigest ??
              (() => {
                throw dataIntegrityError("live transmission digest");
              })(),
          ),
        };

  return deepFreeze({
    agentRevisionFingerprint: fingerprint(record.agentRevisionFingerprint),
    agentRevisionId: agentRevisionId(record.agentRevisionId),
    attemptNumber: record.attemptNumber,
    budget: parseCanonicalJsonColumnWithSchema(record.budgetJson, "audit budget", runBudgetSchema),
    completedCaseCount: record.completedCaseCount,
    createdAt: utcTimestamp(record.createdAt),
    currentPhase,
    engineVersion: versionIdentifier(record.engineVersion),
    evaluationPolicyVersion: versionIdentifier(record.evaluationPolicyVersion),
    fixtureVersion: versionIdentifier(record.fixtureVersion),
    id: auditRunId(record.id),
    idempotencyKey: record.idempotencyKey,
    mode,
    plannedCaseCount: record.plannedCaseCount,
    recordVersion: record.recordVersion,
    runPurpose,
    scoringPolicyVersion: versionIdentifier(record.scoringPolicyVersion),
    seed: record.seed,
    status,
    taxonomyVersion: versionIdentifier(record.taxonomyVersion),
    updatedAt: utcTimestamp(record.updatedAt),
    ...(record.auditPlanId === null ? {} : { auditPlanId: auditPlanId(record.auditPlanId) }),
    ...(record.auditPlanFingerprint === null
      ? {}
      : { auditPlanFingerprint: fingerprint(record.auditPlanFingerprint) }),
    ...(record.baselineRunId === null ? {} : { baselineRunId: auditRunId(record.baselineRunId) }),
    ...(record.retryOfRunId === null ? {} : { retryOfRunId: auditRunId(record.retryOfRunId) }),
    ...(liveConfiguration === undefined ? {} : { liveConfiguration }),
    ...(record.cancellationRequestedAt === null
      ? {}
      : { cancellationRequestedAt: utcTimestamp(record.cancellationRequestedAt) }),
    ...(record.failureCode === null || record.failureSummary === null
      ? {}
      : { failure: { code: record.failureCode, summary: record.failureSummary } }),
    ...(record.startedAt === null ? {} : { startedAt: utcTimestamp(record.startedAt) }),
    ...(record.completedAt === null ? {} : { completedAt: utcTimestamp(record.completedAt) }),
  });
}

export function mapAuditJobRecord(record: AuditJobRecord): PersistedAuditJob {
  const status = jobStatusSchema.parse(record.status);
  if (record.attemptCount < 0 || record.recordVersion < 1) {
    throw dataIntegrityError("audit job");
  }
  if (
    (status === "LEASED") !== (record.leaseOwner !== null && record.leaseExpiresAt !== null) ||
    (status === "WAITING_RETRY") !== (record.nextAttemptAt !== null)
  ) {
    throw dataIntegrityError("audit job lifecycle metadata");
  }

  return deepFreeze({
    attemptCount: record.attemptCount,
    auditRunId: auditRunId(record.auditRunId),
    createdAt: utcTimestamp(record.createdAt),
    id: auditJobIdParser(record.id),
    recordVersion: record.recordVersion,
    stage: record.stage,
    status,
    updatedAt: utcTimestamp(record.updatedAt),
    ...(record.leaseOwner === null ? {} : { leaseOwner: record.leaseOwner }),
    ...(record.leaseExpiresAt === null
      ? {}
      : { leaseExpiresAt: utcTimestamp(record.leaseExpiresAt) }),
    ...(record.nextAttemptAt === null ? {} : { nextAttemptAt: utcTimestamp(record.nextAttemptAt) }),
    ...(record.lastErrorCode === null ? {} : { lastErrorCode: record.lastErrorCode }),
  });
}
