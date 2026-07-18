import {
  compareTimestamps,
  deepFreeze,
  type Fingerprint,
  InvariantViolation,
  type UtcTimestamp,
  ValidationError,
} from "../../../shared/domain";
import type { AuditPlanKind, AuditPlanStatus } from "./audit-plan";
import type {
  AuditPhase,
  AuditRun,
  AuditRunFailure,
  AuditRunStatus,
  CreateAuditRunInput,
  RunBudget,
} from "./audit-run-types";
import type { AuditPlanId } from "./ids";
import { auditRunId } from "./ids";

const ALLOWED_TRANSITIONS: Readonly<Record<AuditRunStatus, ReadonlySet<AuditRunStatus>>> = {
  CANCELLED: new Set(),
  CANCELLING: new Set(["CANCELLED", "INTERRUPTED"]),
  COMPLETED: new Set(),
  EVALUATING: new Set(["CANCELLING", "FAILED", "FINALIZING", "INTERRUPTED"]),
  EXECUTING: new Set(["CANCELLING", "EVALUATING", "FAILED", "INTERRUPTED"]),
  FAILED: new Set(),
  FINALIZING: new Set(["COMPLETED", "FAILED", "INTERRUPTED"]),
  INTERRUPTED: new Set(["CANCELLED", "FAILED", "QUEUED"]),
  PLANNING: new Set(["CANCELLING", "EXECUTING", "FAILED", "INTERRUPTED"]),
  QUEUED: new Set(["CANCELLING", "INTERRUPTED", "PLANNING"]),
};

const DEFAULT_PHASE: Readonly<Record<AuditRunStatus, AuditPhase>> = {
  CANCELLED: "CANCELLED",
  CANCELLING: "CANCELLING",
  COMPLETED: "COMPLETED",
  EVALUATING: "EVALUATING_RESULTS",
  EXECUTING: "RUNNING_TESTS",
  FAILED: "FAILED",
  FINALIZING: "FINALIZING_RESULTS",
  INTERRUPTED: "INTERRUPTED",
  PLANNING: "ANALYZING_SURFACE",
  QUEUED: "QUEUED",
};

const PHASE_TRANSITIONS: Readonly<Partial<Record<AuditPhase, AuditPhase>>> = {
  ANALYZING_SURFACE: "BUILDING_PLAN",
  CORRELATING_FINDINGS: "CALCULATING_SCORES",
  EVALUATING_RESULTS: "CORRELATING_FINDINGS",
};

function validateRunBudget(budget: RunBudget): RunBudget {
  const maximums: Readonly<Record<keyof RunBudget, number>> = {
    maxCases: 200,
    maxDurationMs: 3_600_000,
    maxModelOutputTokensPerCase: 100_000,
    maxStepsPerCase: 50,
    maxToolAttemptsPerCase: 50,
  };
  for (const [field, maximum] of Object.entries(maximums) as [keyof RunBudget, number][]) {
    const value = budget[field];
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new ValidationError(`${field} must be an integer between 1 and ${maximum}.`, field);
    }
  }
  return { ...budget };
}

function safeReason(value: string, field: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum || /[\r\n]/u.test(normalized)) {
    throw new ValidationError(`${field} must be a bounded single-line value.`, field);
  }
  return normalized;
}

export function createAuditRun(input: CreateAuditRunInput): AuditRun {
  if (input.runPurpose === "VERIFICATION" && input.baselineRunId === undefined) {
    throw new ValidationError("A verification run requires a baseline run.", "baselineRunId");
  }
  if (input.runPurpose !== "VERIFICATION" && input.baselineRunId !== undefined) {
    throw new ValidationError(
      "Only verification runs may reference a baseline run.",
      "baselineRunId",
    );
  }
  if ((input.mode === "LIVE") !== (input.liveConfiguration !== undefined)) {
    throw new ValidationError(
      "Live configuration is required only for explicitly selected Live Mode runs.",
      "liveConfiguration",
    );
  }
  if (
    input.liveConfiguration !== undefined &&
    input.liveConfiguration.modelReference.trim().length === 0
  ) {
    throw new ValidationError("Live Mode requires an exact model reference.", "modelReference");
  }

  const idempotencyKey = safeReason(input.idempotencyKey, "idempotencyKey", 200);
  const seed = safeReason(input.seed, "seed", 200);

  return deepFreeze({
    ...input,
    attemptNumber: 1,
    budget: validateRunBudget(input.budget),
    completedCaseCount: 0,
    currentPhase: "QUEUED" as const,
    id: auditRunId(input.id),
    idempotencyKey,
    plannedCaseCount: 0,
    recordVersion: 1,
    seed,
    status: "QUEUED" as const,
    updatedAt: input.createdAt,
  });
}

export function attachLockedAuditPlan(
  run: AuditRun,
  plan: {
    readonly id: AuditPlanId;
    readonly fingerprint: Fingerprint;
    readonly kind: AuditPlanKind;
    readonly plannedCaseCount: number;
    readonly status: AuditPlanStatus;
  },
  updatedAt: UtcTimestamp,
): AuditRun {
  if (run.status !== "PLANNING") {
    throw new InvariantViolation("A locked audit plan can be attached only while planning.");
  }
  if (run.auditPlanId !== undefined || run.auditPlanFingerprint !== undefined) {
    throw new InvariantViolation("An audit run cannot replace its attached plan.");
  }
  if (plan.status !== "LOCKED") {
    throw new InvariantViolation("An audit run requires a locked audit plan.");
  }
  const requiredKind: AuditPlanKind =
    run.runPurpose === "SUPPLEMENTAL" ? "SUPPLEMENTAL" : "PRIMARY";
  if (plan.kind !== requiredKind) {
    throw new InvariantViolation(
      `${run.runPurpose} runs require a ${requiredKind.toLowerCase()} audit plan.`,
    );
  }
  if (!Number.isSafeInteger(plan.plannedCaseCount) || plan.plannedCaseCount < 1) {
    throw new ValidationError("A locked plan must contain at least one case.", "plannedCaseCount");
  }
  if (plan.plannedCaseCount > run.budget.maxCases) {
    throw new InvariantViolation("Attached plan exceeds the run case budget.");
  }
  assertTimestampProgress(run, updatedAt);

  return deepFreeze({
    ...run,
    auditPlanFingerprint: plan.fingerprint,
    auditPlanId: plan.id,
    currentPhase: "BUILDING_PLAN" as const,
    plannedCaseCount: plan.plannedCaseCount,
    recordVersion: run.recordVersion + 1,
    updatedAt,
  });
}

function assertTimestampProgress(run: AuditRun, timestamp: UtcTimestamp): void {
  if (compareTimestamps(timestamp, run.updatedAt) < 0) {
    throw new InvariantViolation("Audit run timestamps cannot move backwards.");
  }
}

export function transitionAuditRun(
  run: AuditRun,
  nextStatus: AuditRunStatus,
  updatedAt: UtcTimestamp,
  failure?: AuditRunFailure,
): AuditRun {
  if (!ALLOWED_TRANSITIONS[run.status].has(nextStatus)) {
    throw new InvariantViolation(`Invalid audit run transition: ${run.status} -> ${nextStatus}.`);
  }
  assertTimestampProgress(run, updatedAt);

  if (nextStatus === "EXECUTING") {
    if (
      run.auditPlanId === undefined ||
      run.auditPlanFingerprint === undefined ||
      run.plannedCaseCount < 1
    ) {
      throw new InvariantViolation("Execution requires a compatible locked audit plan.");
    }
    if (run.currentPhase !== "BUILDING_PLAN") {
      throw new InvariantViolation("Execution requires planning to reach the locked-plan phase.");
    }
  }
  if (nextStatus === "EVALUATING" && run.completedCaseCount !== run.plannedCaseCount) {
    throw new InvariantViolation("Evaluation requires a terminal result for every planned case.");
  }
  if (nextStatus === "COMPLETED" && run.completedCaseCount !== run.plannedCaseCount) {
    throw new InvariantViolation("A completed run requires every planned case to be complete.");
  }
  if (nextStatus === "FINALIZING" && run.currentPhase !== "CALCULATING_SCORES") {
    throw new InvariantViolation(
      "Finalization requires evaluation and score calculation to finish.",
    );
  }
  if ((nextStatus === "FAILED" || nextStatus === "INTERRUPTED") !== (failure !== undefined)) {
    throw new ValidationError(
      "Failed and interrupted transitions require a safe failure; other transitions do not accept one.",
      "failure",
    );
  }

  const normalizedFailure =
    failure === undefined
      ? undefined
      : {
          code: safeReason(failure.code, "failure.code", 100),
          summary: safeReason(failure.summary, "failure.summary", 500),
        };
  const becomesTerminal =
    nextStatus === "CANCELLED" || nextStatus === "COMPLETED" || nextStatus === "FAILED";
  const starts = nextStatus === "PLANNING" && run.startedAt === undefined;
  const recovers = run.status === "INTERRUPTED" && nextStatus === "QUEUED";
  const { failure: _previousFailure, ...runWithoutFailure } = run;

  return deepFreeze({
    ...runWithoutFailure,
    attemptNumber: recovers ? run.attemptNumber + 1 : run.attemptNumber,
    currentPhase: DEFAULT_PHASE[nextStatus],
    recordVersion: run.recordVersion + 1,
    status: nextStatus,
    updatedAt,
    ...(starts ? { startedAt: updatedAt } : {}),
    ...(becomesTerminal ? { completedAt: updatedAt } : {}),
    ...(normalizedFailure === undefined ? {} : { failure: normalizedFailure }),
  });
}

export function advanceAuditPhase(
  run: AuditRun,
  nextPhase: AuditPhase,
  updatedAt: UtcTimestamp,
): AuditRun {
  if (PHASE_TRANSITIONS[run.currentPhase] !== nextPhase) {
    throw new InvariantViolation(
      `Invalid audit phase transition: ${run.currentPhase} -> ${nextPhase}.`,
    );
  }
  const requiredStatus: Readonly<Partial<Record<AuditPhase, AuditRunStatus>>> = {
    BUILDING_PLAN: "PLANNING",
    CALCULATING_SCORES: "EVALUATING",
    CORRELATING_FINDINGS: "EVALUATING",
    FINALIZING_RESULTS: "FINALIZING",
  };
  if (requiredStatus[nextPhase] !== run.status) {
    throw new InvariantViolation(
      `Phase ${nextPhase} is not valid while run status is ${run.status}.`,
    );
  }
  assertTimestampProgress(run, updatedAt);
  return deepFreeze({
    ...run,
    currentPhase: nextPhase,
    recordVersion: run.recordVersion + 1,
    updatedAt,
  });
}

export function recordCompletedCase(run: AuditRun, updatedAt: UtcTimestamp): AuditRun {
  if (run.status !== "EXECUTING") {
    throw new InvariantViolation("Case progress may be recorded only while executing.");
  }
  if (run.completedCaseCount >= run.plannedCaseCount) {
    throw new InvariantViolation("Completed case count cannot exceed planned case count.");
  }
  assertTimestampProgress(run, updatedAt);
  return deepFreeze({
    ...run,
    completedCaseCount: run.completedCaseCount + 1,
    recordVersion: run.recordVersion + 1,
    updatedAt,
  });
}

export function requestAuditCancellation(run: AuditRun, requestedAt: UtcTimestamp): AuditRun {
  if (run.status === "CANCELLING") {
    return run;
  }
  if (run.status === "INTERRUPTED") {
    const cancelled = transitionAuditRun(run, "CANCELLED", requestedAt);
    return deepFreeze({ ...cancelled, cancellationRequestedAt: requestedAt });
  }
  if (!new Set<AuditRunStatus>(["EVALUATING", "EXECUTING", "PLANNING", "QUEUED"]).has(run.status)) {
    throw new InvariantViolation(`Cancellation cannot be requested from ${run.status}.`);
  }
  const cancelling = transitionAuditRun(run, "CANCELLING", requestedAt);
  return deepFreeze({ ...cancelling, cancellationRequestedAt: requestedAt });
}

export class AuditStateTransitionPolicy {
  transition(
    run: AuditRun,
    nextStatus: AuditRunStatus,
    updatedAt: UtcTimestamp,
    failure?: AuditRunFailure,
  ): AuditRun {
    return transitionAuditRun(run, nextStatus, updatedAt, failure);
  }

  requestCancellation(run: AuditRun, requestedAt: UtcTimestamp): AuditRun {
    return requestAuditCancellation(run, requestedAt);
  }
}
