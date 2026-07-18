import type {
  CanonicalJsonObject,
  ContentDigest,
  Fingerprint,
  UtcTimestamp,
  VersionIdentifier,
} from "../../../shared/domain";
import type { AgentRevisionId } from "../../agent-catalog/domain";
import type { AuditPlanId, AuditRunId } from "./ids";

export type AuditMode = "DEMO" | "LIVE";
export type AuditRunPurpose = "BASELINE" | "SUPPLEMENTAL" | "VERIFICATION";

export type AuditRunStatus =
  | "CANCELLED"
  | "CANCELLING"
  | "COMPLETED"
  | "EVALUATING"
  | "EXECUTING"
  | "FAILED"
  | "FINALIZING"
  | "INTERRUPTED"
  | "PLANNING"
  | "QUEUED";

export type AuditPhase =
  | "ANALYZING_SURFACE"
  | "BUILDING_PLAN"
  | "CALCULATING_SCORES"
  | "CANCELLED"
  | "CANCELLING"
  | "COMPLETED"
  | "CORRELATING_FINDINGS"
  | "EVALUATING_RESULTS"
  | "FAILED"
  | "FINALIZING_RESULTS"
  | "INTERRUPTED"
  | "QUEUED"
  | "RUNNING_TESTS";

export interface RunBudget {
  readonly maxCases: number;
  readonly maxDurationMs: number;
  readonly maxModelOutputTokensPerCase: number;
  readonly maxStepsPerCase: number;
  readonly maxToolAttemptsPerCase: number;
}

export interface LiveRunConfiguration {
  readonly modelReference: string;
  readonly modelRequestProfileSchemaVersion: VersionIdentifier;
  readonly modelRequestProfile: CanonicalJsonObject;
  readonly modelRequestProfileDigest: ContentDigest;
  readonly liveConsentVersion: VersionIdentifier;
  readonly liveConsentAt: UtcTimestamp;
  readonly transmissionSummaryDigest: ContentDigest;
}

export interface AuditRunFailure {
  readonly code: string;
  readonly summary: string;
}

export interface AuditRun {
  readonly id: AuditRunId;
  readonly agentRevisionId: AgentRevisionId;
  readonly agentRevisionFingerprint: Fingerprint;
  readonly runPurpose: AuditRunPurpose;
  readonly auditPlanId?: AuditPlanId;
  readonly auditPlanFingerprint?: Fingerprint;
  readonly baselineRunId?: AuditRunId;
  readonly retryOfRunId?: AuditRunId;
  readonly idempotencyKey: string;
  readonly mode: AuditMode;
  readonly liveConfiguration?: LiveRunConfiguration;
  readonly status: AuditRunStatus;
  readonly currentPhase: AuditPhase;
  readonly engineVersion: VersionIdentifier;
  readonly taxonomyVersion: VersionIdentifier;
  readonly evaluationPolicyVersion: VersionIdentifier;
  readonly scoringPolicyVersion: VersionIdentifier;
  readonly fixtureVersion: VersionIdentifier;
  readonly seed: string;
  readonly budget: RunBudget;
  readonly plannedCaseCount: number;
  readonly completedCaseCount: number;
  readonly attemptNumber: number;
  readonly recordVersion: number;
  readonly cancellationRequestedAt?: UtcTimestamp;
  readonly failure?: AuditRunFailure;
  readonly createdAt: UtcTimestamp;
  readonly startedAt?: UtcTimestamp;
  readonly completedAt?: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface CreateAuditRunInput extends Omit<
  AuditRun,
  | "attemptNumber"
  | "auditPlanFingerprint"
  | "auditPlanId"
  | "cancellationRequestedAt"
  | "completedAt"
  | "completedCaseCount"
  | "currentPhase"
  | "failure"
  | "id"
  | "plannedCaseCount"
  | "recordVersion"
  | "startedAt"
  | "status"
  | "updatedAt"
> {
  readonly id: string;
}
