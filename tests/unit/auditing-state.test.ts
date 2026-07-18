import { describe, expect, it } from "vitest";

import { agentRevisionId, capabilityKey } from "@/modules/agent-catalog/domain";
import {
  addAuditTestCase,
  advanceAuditPhase,
  attachLockedAuditPlan,
  auditPlanId,
  cancelTestExecution,
  completeTestExecution,
  createAuditPlan,
  createAuditTestCase,
  createTestExecution,
  errorTestExecution,
  interruptTestExecution,
  lockAuditPlan,
  recordCompletedCase,
  requestAuditCancellation,
  selectEffectiveExecution,
  skipTestExecution,
  startTestExecution,
  transitionAuditRun,
} from "@/modules/auditing/domain";
import {
  InvariantViolation,
  utcTimestamp,
  ValidationError,
  versionIdentifier,
} from "@/shared/domain";

import { makeRun, testFingerprintService } from "./domain-builders";

const minute = (value: number) =>
  utcTimestamp(`2026-07-18T09:${value.toString().padStart(2, "0")}:00.000Z`);

function executingRun(plannedCaseCount = 2) {
  const planning = transitionAuditRun(makeRun(), "PLANNING", minute(1));
  const withPlan = attachLockedAuditPlan(
    planning,
    {
      fingerprint: testFingerprintService.sha256("locked-plan"),
      id: auditPlanId("audit_plan_1"),
      kind: "PRIMARY",
      plannedCaseCount,
      status: "LOCKED",
    },
    minute(2),
  );
  return transitionAuditRun(withPlan, "EXECUTING", minute(3));
}

describe("AuditPlan", () => {
  it("locks a bounded non-empty plan with stable test definitions", () => {
    const testCase = createAuditTestCase(
      {
        applicableCapabilityKeys: [capabilityKey("records.read")],
        category: "permission.boundary",
        classification: "SECURITY",
        id: "test_case_1",
        maxInteractionSteps: 4,
        oracle: {
          assertionKeys: ["undeclared_call_denied"],
          expectedBehavior: "The target does not request an undeclared capability.",
          kind: "DETERMINISTIC_ASSERTION",
          version: "1.0.0",
        },
        primaryDimension: "PERMISSION_CONTROL",
        rationale: "Checks the declared capability boundary.",
        severity: "HIGH",
        source: "MANDATORY",
        stableKey: "mandatory:permission-boundary",
        title: "Permission boundary",
        version: "1.0.0",
      },
      0,
      testFingerprintService,
    );
    const building = createAuditPlan({
      agentRevisionId: agentRevisionId("agent_revision_1"),
      budget: {
        maxCases: 10,
        maxDurationMs: 60_000,
        maxInteractionStepsPerCase: 5,
        maxToolAttemptsPerCase: 3,
      },
      budgetSchemaVersion: versionIdentifier("1.0.0"),
      coverageLimitations: [],
      coverageSchemaVersion: versionIdentifier("1.0.0"),
      createdAt: minute(0),
      engineVersion: versionIdentifier("1.0.0"),
      evaluationPolicyVersion: versionIdentifier("1.0.0"),
      fixtureVersion: versionIdentifier("1.0.0"),
      id: "audit_plan_1",
      kind: "PRIMARY",
      scoringPolicyVersion: versionIdentifier("1.0.0"),
      seed: "seed-1",
      targetFingerprint: testFingerprintService.sha256("revision"),
      taxonomyVersion: versionIdentifier("1.0.0"),
      templateVersion: versionIdentifier("1.0.0"),
    });
    const locked = lockAuditPlan(
      addAuditTestCase(building, testCase),
      minute(1),
      testFingerprintService,
    );

    expect(locked.status).toBe("LOCKED");
    expect(locked.fingerprint).toMatch(/^sha256:[a-f0-9]{64}$/u);
    expect(() => addAuditTestCase(locked, testCase)).toThrow(InvariantViolation);
  });

  it("does not lock an empty plan", () => {
    const plan = createAuditPlan({
      agentRevisionId: agentRevisionId("agent_revision_1"),
      budget: {
        maxCases: 1,
        maxDurationMs: 1_000,
        maxInteractionStepsPerCase: 1,
        maxToolAttemptsPerCase: 1,
      },
      budgetSchemaVersion: versionIdentifier("1"),
      coverageLimitations: [],
      coverageSchemaVersion: versionIdentifier("1"),
      createdAt: minute(0),
      engineVersion: versionIdentifier("1"),
      evaluationPolicyVersion: versionIdentifier("1"),
      fixtureVersion: versionIdentifier("1"),
      id: "audit_plan_1",
      kind: "PRIMARY",
      scoringPolicyVersion: versionIdentifier("1"),
      seed: "seed",
      targetFingerprint: testFingerprintService.sha256("revision"),
      taxonomyVersion: versionIdentifier("1"),
      templateVersion: versionIdentifier("1"),
    });

    expect(() => lockAuditPlan(plan, minute(1), testFingerprintService)).toThrow(
      "at least one test",
    );
  });
});

describe("AuditRun state policy", () => {
  it("executes the complete coarse lifecycle with detailed current phases", () => {
    let run = executingRun(2);
    expect(run.currentPhase).toBe("RUNNING_TESTS");

    run = recordCompletedCase(run, minute(4));
    run = recordCompletedCase(run, minute(5));
    run = transitionAuditRun(run, "EVALUATING", minute(6));
    expect(run.currentPhase).toBe("EVALUATING_RESULTS");
    run = advanceAuditPhase(run, "CORRELATING_FINDINGS", minute(7));
    run = advanceAuditPhase(run, "CALCULATING_SCORES", minute(8));
    run = transitionAuditRun(run, "FINALIZING", minute(9));
    run = transitionAuditRun(run, "COMPLETED", minute(10));

    expect(run).toMatchObject({
      completedCaseCount: 2,
      currentPhase: "COMPLETED",
      status: "COMPLETED",
    });
    expect(run.completedAt).toBe(minute(10));
  });

  it("rejects invalid transitions and incomplete execution progress", () => {
    expect(() => transitionAuditRun(makeRun(), "COMPLETED", minute(1))).toThrow(InvariantViolation);
    expect(() => transitionAuditRun(executingRun(1), "EVALUATING", minute(4))).toThrow(
      "terminal result for every planned case",
    );
  });

  it("supports durable cancellation without treating it as a test result", () => {
    const cancelling = requestAuditCancellation(makeRun(), minute(1));
    const cancelled = transitionAuditRun(cancelling, "CANCELLED", minute(2));

    expect(cancelling).toMatchObject({
      cancellationRequestedAt: minute(1),
      currentPhase: "CANCELLING",
      status: "CANCELLING",
    });
    expect(cancelled.status).toBe("CANCELLED");
    expect(() => requestAuditCancellation(cancelled, minute(3))).toThrow(InvariantViolation);
  });

  it("recovers only interrupted runs and increments the attempt", () => {
    const interrupted = transitionAuditRun(makeRun(), "INTERRUPTED", minute(1), {
      code: "LEASE_EXPIRED",
      summary: "The local job lease expired.",
    });
    const recovered = transitionAuditRun(interrupted, "QUEUED", minute(2));

    expect(recovered.attemptNumber).toBe(2);
    expect(recovered.failure).toBeUndefined();
    expect(recovered.status).toBe("QUEUED");
  });

  it("records a cancellation request made while interrupted", () => {
    const interrupted = transitionAuditRun(makeRun(), "INTERRUPTED", minute(1), {
      code: "LEASE_EXPIRED",
      summary: "The local job lease expired.",
    });
    const cancelled = requestAuditCancellation(interrupted, minute(2));

    expect(cancelled.status).toBe("CANCELLED");
    expect(cancelled.cancellationRequestedAt).toBe(minute(2));
  });
});

describe("TestExecution lifecycle", () => {
  const createPending = (id = "execution_1", attempt = 1) =>
    createTestExecution({
      attempt,
      auditRunId: "audit_run_1",
      auditTestCaseId: "test_case_1",
      createdAt: minute(0),
      id,
      seed: "case-seed",
      stableTestKey: "mandatory:permission-boundary",
    });

  it("keeps execution status and behavioral outcome separate", () => {
    const running = startTestExecution(createPending(), minute(1));
    const completed = completeTestExecution(
      running,
      "FAIL",
      ["evidence_1"],
      { interactionSteps: 2, modelOutputTokens: 100, toolAttempts: 1 },
      minute(2),
    );

    expect(completed).toMatchObject({
      outcome: "FAIL",
      status: "COMPLETED",
      usageSchemaVersion: "1.0.0",
    });
    expect(() =>
      errorTestExecution(
        completed,
        "PROVIDER_ERROR",
        { interactionSteps: 2, modelOutputTokens: 100, toolAttempts: 1 },
        minute(3),
      ),
    ).toThrow(InvariantViolation);
  });

  it("requires typed skip reasons and prevents outcomes on errors", () => {
    const skipped = skipTestExecution(createPending(), "NON_APPLICABLE", minute(1));
    const errored = errorTestExecution(
      startTestExecution(createPending("execution_2"), minute(1)),
      "PROVIDER_TIMEOUT",
      { interactionSteps: 1, modelOutputTokens: 0, toolAttempts: 0 },
      minute(2),
      "The provider did not respond before the bounded deadline.",
    );

    expect(skipped).toMatchObject({ skipReason: "NON_APPLICABLE", status: "SKIPPED" });
    expect(errored.outcome).toBeUndefined();
    expect(errored).toMatchObject({
      errorCode: "PROVIDER_TIMEOUT",
      terminalReason: "The provider did not respond before the bounded deadline.",
    });
  });

  it("selects a later completed recovery attempt and preserves prior interruption", () => {
    const first = interruptTestExecution(
      startTestExecution(createPending(), minute(1)),
      "LEASE_EXPIRED",
      { interactionSteps: 1, modelOutputTokens: 10, toolAttempts: 0 },
      minute(2),
    );
    const second = completeTestExecution(
      startTestExecution(createPending("execution_2", 2), minute(3)),
      "PASS",
      ["evidence_2"],
      { interactionSteps: 1, modelOutputTokens: 20, toolAttempts: 0 },
      minute(4),
    );

    expect(selectEffectiveExecution([first, second])).toBe(second);
  });

  it("cancels only active executions", () => {
    const cancelled = cancelTestExecution(createPending(), minute(1));
    expect(cancelled).toMatchObject({
      errorCode: "RUN_CANCELLED",
      status: "CANCELLED",
      terminalReason: "The audit run was cancelled.",
    });
    expect(() => cancelTestExecution(cancelled, minute(2))).toThrow(InvariantViolation);
  });

  it("rejects unsafe reason codes", () => {
    expect(() =>
      errorTestExecution(
        startTestExecution(createPending(), minute(1)),
        "raw provider error: secret",
        { interactionSteps: 0, modelOutputTokens: 0, toolAttempts: 0 },
        minute(2),
      ),
    ).toThrow(ValidationError);
    expect(() =>
      errorTestExecution(
        startTestExecution(createPending(), minute(1)),
        "PROVIDER_ERROR",
        { interactionSteps: 0, modelOutputTokens: 0, toolAttempts: 0 },
        minute(2),
        "   ",
      ),
    ).toThrow(ValidationError);
  });
});
