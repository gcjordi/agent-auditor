import {
  compareTimestamps,
  deepFreeze,
  InvariantViolation,
  type UtcTimestamp,
  ValidationError,
  type VersionIdentifier,
  versionIdentifier,
} from "../../../shared/domain";
import {
  type AuditRunId,
  auditRunId,
  type AuditTestCaseId,
  auditTestCaseId,
  type EvidenceRecordId,
  evidenceRecordId,
  type TestExecutionId,
  testExecutionId,
} from "./ids";
import { type StableTestKey, stableTestKey } from "./taxonomy";

export type TestExecutionStatus =
  "CANCELLED" | "COMPLETED" | "ERRORED" | "INTERRUPTED" | "PENDING" | "RUNNING" | "SKIPPED";

export type TestOutcome = "FAIL" | "INCONCLUSIVE" | "PASS" | "WARNING";
export type ScorableTestOutcome = Exclude<TestOutcome, "INCONCLUSIVE">;
export type SkipReason = "BUDGET_EXHAUSTED" | "DEPENDENCY_UNAVAILABLE" | "NON_APPLICABLE";
export const EXECUTION_USAGE_SCHEMA_VERSION = versionIdentifier("1.0.0");

export interface ExecutionUsage {
  readonly interactionSteps: number;
  readonly modelOutputTokens: number;
  readonly toolAttempts: number;
}

export interface TestExecution {
  readonly id: TestExecutionId;
  readonly auditRunId: AuditRunId;
  readonly auditTestCaseId: AuditTestCaseId;
  readonly stableTestKey: StableTestKey;
  readonly attempt: number;
  readonly status: TestExecutionStatus;
  readonly outcome?: TestOutcome;
  readonly skipReason?: SkipReason;
  readonly seed: string;
  readonly usage: ExecutionUsage;
  readonly usageSchemaVersion: VersionIdentifier;
  readonly evidenceRecordIds: readonly EvidenceRecordId[];
  readonly errorCode?: string;
  readonly terminalReason?: string;
  readonly createdAt: UtcTimestamp;
  readonly startedAt?: UtcTimestamp;
  readonly completedAt?: UtcTimestamp;
}

export interface CreateTestExecutionInput {
  readonly id: string;
  readonly auditRunId: string;
  readonly auditTestCaseId: string;
  readonly stableTestKey: string;
  readonly attempt: number;
  readonly seed: string;
  readonly createdAt: UtcTimestamp;
}

const ZERO_USAGE: ExecutionUsage = Object.freeze({
  interactionSteps: 0,
  modelOutputTokens: 0,
  toolAttempts: 0,
});

function safeReasonCode(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Z][A-Z0-9_]{0,99}$/u.test(normalized)) {
    throw new ValidationError(
      "Safe reason code must be a stable uppercase identifier.",
      "reasonCode",
    );
  }
  return normalized;
}

function safeTerminalReason(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 500) {
    throw new ValidationError(
      "Terminal reason must contain 1 to 500 characters.",
      "terminalReason",
    );
  }
  return normalized;
}

function validateUsage(usage: ExecutionUsage): ExecutionUsage {
  for (const [field, value] of Object.entries(usage)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ValidationError(`${field} usage must be a non-negative integer.`, field);
    }
  }
  return { ...usage };
}

function terminalize(
  execution: TestExecution,
  completedAt: UtcTimestamp,
  changes: Partial<TestExecution>,
): TestExecution {
  if (compareTimestamps(completedAt, execution.createdAt) < 0) {
    throw new InvariantViolation("Execution completion cannot precede creation.");
  }
  return deepFreeze({ ...execution, ...changes, completedAt });
}

export function createTestExecution(input: CreateTestExecutionInput): TestExecution {
  if (!Number.isSafeInteger(input.attempt) || input.attempt < 1) {
    throw new ValidationError("Execution attempt must be a positive integer.", "attempt");
  }
  const seed = input.seed.trim();
  if (seed.length === 0 || seed.length > 200) {
    throw new ValidationError("Execution seed must contain 1 to 200 characters.", "seed");
  }

  return deepFreeze({
    ...input,
    auditRunId: auditRunId(input.auditRunId),
    auditTestCaseId: auditTestCaseId(input.auditTestCaseId),
    evidenceRecordIds: [],
    id: testExecutionId(input.id),
    stableTestKey: stableTestKey(input.stableTestKey),
    status: "PENDING" as const,
    usage: ZERO_USAGE,
    usageSchemaVersion: EXECUTION_USAGE_SCHEMA_VERSION,
  });
}

export function startTestExecution(
  execution: TestExecution,
  startedAt: UtcTimestamp,
): TestExecution {
  if (execution.status !== "PENDING") {
    throw new InvariantViolation("Only a pending test execution can start.");
  }
  if (compareTimestamps(startedAt, execution.createdAt) < 0) {
    throw new InvariantViolation("Execution start cannot precede creation.");
  }
  return deepFreeze({ ...execution, startedAt, status: "RUNNING" as const });
}

export function completeTestExecution(
  execution: TestExecution,
  outcome: TestOutcome,
  evidenceIds: readonly string[],
  usage: ExecutionUsage,
  completedAt: UtcTimestamp,
): TestExecution {
  if (execution.status !== "RUNNING") {
    throw new InvariantViolation("Only a running test execution can complete.");
  }
  if (evidenceIds.length === 0) {
    throw new InvariantViolation("A completed test outcome requires evidence.");
  }

  const normalizedEvidenceIds = evidenceIds.map(evidenceRecordId);
  if (new Set(normalizedEvidenceIds).size !== normalizedEvidenceIds.length) {
    throw new ValidationError("Execution evidence references must be unique.", "evidenceRecordIds");
  }

  return terminalize(execution, completedAt, {
    evidenceRecordIds: normalizedEvidenceIds,
    outcome,
    status: "COMPLETED",
    usage: validateUsage(usage),
  });
}

export function errorTestExecution(
  execution: TestExecution,
  reasonCode: string,
  usage: ExecutionUsage,
  completedAt: UtcTimestamp,
  terminalReason?: string,
): TestExecution {
  if (execution.status !== "RUNNING") {
    throw new InvariantViolation("Only a running test execution can error.");
  }
  return terminalize(execution, completedAt, {
    errorCode: safeReasonCode(reasonCode),
    status: "ERRORED",
    ...(terminalReason === undefined ? {} : { terminalReason: safeTerminalReason(terminalReason) }),
    usage: validateUsage(usage),
  });
}

export function interruptTestExecution(
  execution: TestExecution,
  reasonCode: string,
  usage: ExecutionUsage,
  completedAt: UtcTimestamp,
  terminalReason?: string,
): TestExecution {
  if (execution.status !== "RUNNING") {
    throw new InvariantViolation("Only a running test execution can be interrupted.");
  }
  return terminalize(execution, completedAt, {
    errorCode: safeReasonCode(reasonCode),
    status: "INTERRUPTED",
    ...(terminalReason === undefined ? {} : { terminalReason: safeTerminalReason(terminalReason) }),
    usage: validateUsage(usage),
  });
}

export function skipTestExecution(
  execution: TestExecution,
  skipReason: SkipReason,
  completedAt: UtcTimestamp,
): TestExecution {
  if (execution.status !== "PENDING") {
    throw new InvariantViolation("Only a pending test execution can be skipped.");
  }
  return terminalize(execution, completedAt, { skipReason, status: "SKIPPED" });
}

export function cancelTestExecution(
  execution: TestExecution,
  completedAt: UtcTimestamp,
): TestExecution {
  if (execution.status !== "PENDING" && execution.status !== "RUNNING") {
    throw new InvariantViolation("Only a pending or running test execution can be cancelled.");
  }
  return terminalize(execution, completedAt, {
    errorCode: "RUN_CANCELLED",
    status: "CANCELLED",
    terminalReason: "The audit run was cancelled.",
  });
}

export function selectEffectiveExecution(attempts: readonly TestExecution[]): TestExecution {
  if (attempts.length === 0) {
    throw new ValidationError("At least one execution attempt is required.", "attempts");
  }
  const first = attempts[0];
  if (first === undefined) {
    throw new InvariantViolation("Execution selection received an empty collection.");
  }
  if (
    attempts.some(
      (attempt) =>
        attempt.auditRunId !== first.auditRunId ||
        attempt.auditTestCaseId !== first.auditTestCaseId,
    )
  ) {
    throw new ValidationError(
      "Effective execution attempts must belong to one run and case.",
      "attempts",
    );
  }
  if (new Set(attempts.map((attempt) => attempt.attempt)).size !== attempts.length) {
    throw new ValidationError("Execution attempt numbers must be unique.", "attempts");
  }
  if (attempts.some((attempt) => attempt.status === "PENDING" || attempt.status === "RUNNING")) {
    throw new InvariantViolation(
      "An effective execution cannot be selected while an attempt is active.",
    );
  }

  const ordered = [...attempts].sort((left, right) => right.attempt - left.attempt);
  return ordered.find((attempt) => attempt.status === "COMPLETED") ?? ordered[0] ?? first;
}
