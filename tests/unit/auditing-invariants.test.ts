import { describe, expect, it } from "vitest";

import { agentRevisionId, capabilityKey } from "@/modules/agent-catalog/domain";
import {
  abandonAuditPlan,
  addAuditTestCase,
  advanceAuditPhase,
  attachLockedAuditPlan,
  type AuditPlan,
  auditPlanId,
  auditRunId,
  AuditStateTransitionPolicy,
  type AuditTestCaseInput,
  cancelTestExecution,
  completeTestExecution,
  createAuditPlan,
  createAuditRun,
  createAuditTestCase,
  createEvidenceRecord,
  createTestExecution,
  createTraceEvent,
  errorTestExecution,
  interruptTestExecution,
  lockAuditPlan,
  type NormalizedScoringCase,
  recordCompletedCase,
  requestAuditCancellation,
  selectEffectiveExecution,
  skipTestExecution,
  stableTestKey,
  startTestExecution,
  transitionAuditRun,
} from "@/modules/auditing/domain";
import { addResult, emptyResultCounts } from "@/modules/auditing/domain/score-result-counts";
import {
  contentDigest,
  InvariantViolation,
  utcTimestamp,
  ValidationError,
  versionIdentifier,
} from "@/shared/domain";

import { makeRun, makeRunInput, testFingerprintService } from "./domain-builders";

const minute = (value: number) =>
  utcTimestamp(`2026-07-18T12:${value.toString().padStart(2, "0")}:00.000Z`);

const planBudget = {
  maxCases: 3,
  maxDurationMs: 60_000,
  maxInteractionStepsPerCase: 5,
  maxToolAttemptsPerCase: 3,
} as const;

function testCaseInput(overrides: Partial<AuditTestCaseInput> = {}): AuditTestCaseInput {
  return {
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
    ...overrides,
  };
}

function buildingPlan(
  overrides: Parameters<typeof createAuditPlan>[0] extends infer Input
    ? Partial<Input>
    : never = {},
) {
  return createAuditPlan({
    agentRevisionId: agentRevisionId("agent_revision_1"),
    budget: planBudget,
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
    ...overrides,
  });
}

function pendingExecution(overrides: Partial<Parameters<typeof createTestExecution>[0]> = {}) {
  return createTestExecution({
    attempt: 1,
    auditRunId: "audit_run_1",
    auditTestCaseId: "test_case_1",
    createdAt: minute(10),
    id: "execution_1",
    seed: "case-seed",
    stableTestKey: "mandatory:permission-boundary",
    ...overrides,
  });
}

const zeroUsage = { interactionSteps: 0, modelOutputTokens: 0, toolAttempts: 0 } as const;

describe("AuditPlan invariants", () => {
  it("validates case classification, interaction bounds, and deterministic assertions", () => {
    expect(() =>
      createAuditTestCase(testCaseInput({ maxInteractionSteps: 0 }), 0, testFingerprintService),
    ).toThrow(ValidationError);
    expect(() =>
      createAuditTestCase(testCaseInput({ maxInteractionSteps: 51 }), 0, testFingerprintService),
    ).toThrow(ValidationError);
    expect(() =>
      createAuditTestCase(testCaseInput({ classification: "UTILITY" }), 0, testFingerprintService),
    ).toThrow("Utility classification");
    expect(() =>
      createAuditTestCase(
        testCaseInput({ primaryDimension: "UTILITY_PRESERVATION" }),
        0,
        testFingerprintService,
      ),
    ).toThrow("Utility classification");
    expect(() =>
      createAuditTestCase(
        testCaseInput({
          oracle: {
            assertionKeys: ["same_assertion", "same_assertion"],
            expectedBehavior: "The boundary is preserved.",
            kind: "DETERMINISTIC_ASSERTION",
            version: "1.0.0",
          },
        }),
        0,
        testFingerprintService,
      ),
    ).toThrow("unique");
    expect(() =>
      createAuditTestCase(
        testCaseInput({
          oracle: {
            assertionKeys: [],
            expectedBehavior: "The boundary is preserved.",
            kind: "DETERMINISTIC_ASSERTION",
            version: "1.0.0",
          },
        }),
        0,
        testFingerprintService,
      ),
    ).toThrow("at least one assertion");
  });

  it("allows assertion-free semantic evaluation and normalizes bounded prose", () => {
    const semantic = createAuditTestCase(
      testCaseInput({
        oracle: {
          assertionKeys: [],
          expectedBehavior: "  The response preserves the intended boundary.  ",
          kind: "SEMANTIC_EVALUATION",
          version: "1.0.0",
        },
        rationale: "  Evaluates behavior that needs semantic judgment.  ",
        title: "  Semantic boundary  ",
      }),
      7,
      testFingerprintService,
    );

    expect(semantic).toMatchObject({
      ordinal: 7,
      rationale: "Evaluates behavior that needs semantic judgment.",
      title: "Semantic boundary",
    });
    expect(semantic.oracle.assertionKeys).toEqual([]);
  });

  it("enforces plan budgets at creation and while adding uniquely keyed cases", () => {
    expect(() => buildingPlan({ budget: { ...planBudget, maxCases: 0 } })).toThrow(ValidationError);

    const first = createAuditTestCase(testCaseInput(), 8, testFingerprintService);
    const second = createAuditTestCase(
      testCaseInput({ id: "test_case_2", stableKey: "mandatory:second-boundary" }),
      9,
      testFingerprintService,
    );
    expect(() =>
      buildingPlan({ budget: { ...planBudget, maxCases: 1 }, testCases: [first, second] }),
    ).toThrow("exceeds its case budget");

    const withFirst = addAuditTestCase(buildingPlan(), first);
    expect(withFirst.testCases[0]?.ordinal).toBe(0);
    expect(() => addAuditTestCase(withFirst, first)).toThrow("Stable test keys must be unique");

    const full = addAuditTestCase(buildingPlan({ budget: { ...planBudget, maxCases: 1 } }), first);
    expect(() => addAuditTestCase(full, second)).toThrow("case budget is exhausted");
  });

  it("detects corrupted duplicate keys before locking and protects terminal plan states", () => {
    const first = createAuditTestCase(testCaseInput(), 0, testFingerprintService);
    const second = createAuditTestCase(
      testCaseInput({ id: "test_case_2", stableKey: "mandatory:second-boundary" }),
      1,
      testFingerprintService,
    );
    const plan = addAuditTestCase(buildingPlan(), first);
    const corrupted: AuditPlan = {
      ...plan,
      testCases: [first, { ...second, stableKey: first.stableKey }],
    };

    expect(() => lockAuditPlan(corrupted, minute(1), testFingerprintService)).toThrow(
      "duplicate stable test keys",
    );

    const abandoned = abandonAuditPlan(plan, minute(1));
    expect(abandoned.status).toBe("ABANDONED");
    expect(abandoned.abandonedAt).toBe(minute(1));
    expect(() => lockAuditPlan(abandoned, minute(1), testFingerprintService)).toThrow(
      "Only a building audit plan",
    );

    const locked = lockAuditPlan(plan, minute(1), testFingerprintService);
    expect(() => abandonAuditPlan(locked, minute(2))).toThrow("Only a building audit plan");
  });

  it("fingerprints reproducible plan content rather than persistence identities", () => {
    const firstCase = createAuditTestCase(testCaseInput(), 12, testFingerprintService);
    const secondCase = createAuditTestCase(
      testCaseInput({ id: "different_case_id" }),
      44,
      testFingerprintService,
    );
    const first = lockAuditPlan(
      addAuditTestCase(buildingPlan(), firstCase),
      minute(1),
      testFingerprintService,
    );
    const second = lockAuditPlan(
      addAuditTestCase(buildingPlan({ createdAt: minute(2), id: "different_plan_id" }), secondCase),
      minute(3),
      testFingerprintService,
    );

    expect(second.fingerprint).toBe(first.fingerprint);
  });
});

describe("AuditRun edge cases", () => {
  const liveConfiguration = {
    liveConsentAt: minute(0),
    liveConsentVersion: versionIdentifier("1.0.0"),
    modelReference: "gpt-live-version",
    modelRequestProfile: { reasoning: "medium" },
    modelRequestProfileDigest: contentDigest(testFingerprintService.sha256("request-profile")),
    modelRequestProfileSchemaVersion: versionIdentifier("1.0.0"),
    transmissionSummaryDigest: contentDigest(testFingerprintService.sha256("transmission")),
  } as const;

  it("requires coherent baseline and explicitly selected live-mode metadata", () => {
    expect(() => createAuditRun(makeRunInput({ runPurpose: "VERIFICATION" }))).toThrow(
      "requires a baseline",
    );
    expect(() =>
      createAuditRun(
        makeRunInput({ baselineRunId: auditRunId("baseline_run"), runPurpose: "BASELINE" }),
      ),
    ).toThrow("Only verification runs");
    expect(() => createAuditRun(makeRunInput({ mode: "LIVE" }))).toThrow(
      "Live configuration is required",
    );
    expect(() => createAuditRun(makeRunInput({ liveConfiguration }))).toThrow(
      "Live configuration is required",
    );
    expect(() =>
      createAuditRun({
        ...makeRunInput(),
        liveConfiguration: { ...liveConfiguration, modelReference: "   " },
        mode: "LIVE",
      }),
    ).toThrow("exact model reference");

    expect(
      createAuditRun({ ...makeRunInput(), liveConfiguration, mode: "LIVE" }).liveConfiguration,
    ).toEqual(liveConfiguration);
  });

  it("rejects unsafe request provenance and out-of-range run budgets", () => {
    expect(() => createAuditRun(makeRunInput({ idempotencyKey: "line one\nline two" }))).toThrow(
      "single-line",
    );
    expect(() => createAuditRun(makeRunInput({ seed: "   " }))).toThrow("single-line");
    expect(() =>
      createAuditRun(makeRunInput({ budget: { ...makeRunInput().budget, maxCases: 201 } })),
    ).toThrow("maxCases");
    expect(() =>
      createAuditRun(makeRunInput({ budget: { ...makeRunInput().budget, maxDurationMs: 1.5 } })),
    ).toThrow("maxDurationMs");
  });

  it("attaches exactly one bounded locked plan while planning", () => {
    const descriptor = {
      fingerprint: testFingerprintService.sha256("plan"),
      id: auditPlanId("audit_plan_1"),
      kind: "PRIMARY",
      plannedCaseCount: 1,
      status: "LOCKED",
    } as const;
    expect(() => attachLockedAuditPlan(makeRun(), descriptor, minute(1))).toThrow(
      "only while planning",
    );

    const planning = transitionAuditRun(makeRun(), "PLANNING", minute(1));
    expect(() =>
      attachLockedAuditPlan(planning, { ...descriptor, status: "BUILDING" }, minute(2)),
    ).toThrow("requires a locked audit plan");
    expect(() =>
      attachLockedAuditPlan(planning, { ...descriptor, kind: "SUPPLEMENTAL" }, minute(2)),
    ).toThrow("require a primary audit plan");
    expect(() =>
      attachLockedAuditPlan(planning, { ...descriptor, plannedCaseCount: 0 }, minute(2)),
    ).toThrow("at least one case");
    expect(() =>
      attachLockedAuditPlan(
        planning,
        { ...descriptor, plannedCaseCount: planning.budget.maxCases + 1 },
        minute(2),
      ),
    ).toThrow("exceeds the run case budget");
    expect(() => attachLockedAuditPlan(planning, descriptor, minute(0))).toThrow(
      "timestamps cannot move backwards",
    );

    const attached = attachLockedAuditPlan(planning, descriptor, minute(2));
    expect(() => attachLockedAuditPlan(attached, descriptor, minute(3))).toThrow(
      "cannot replace its attached plan",
    );
  });

  it("requires a locked-plan phase before execution and completed evaluation before finalizing", () => {
    const planning = transitionAuditRun(makeRun(), "PLANNING", minute(1));
    expect(() => transitionAuditRun(planning, "EXECUTING", minute(2))).toThrow(
      "compatible locked audit plan",
    );

    const inconsistentPlanning = {
      ...planning,
      auditPlanFingerprint: testFingerprintService.sha256("plan"),
      auditPlanId: auditPlanId("audit_plan_1"),
      plannedCaseCount: 1,
    };
    expect(() => transitionAuditRun(inconsistentPlanning, "EXECUTING", minute(2))).toThrow(
      "locked-plan phase",
    );

    const attached = attachLockedAuditPlan(
      planning,
      {
        fingerprint: testFingerprintService.sha256("plan"),
        id: auditPlanId("audit_plan_1"),
        kind: "PRIMARY",
        plannedCaseCount: 1,
        status: "LOCKED",
      },
      minute(2),
    );
    const executing = transitionAuditRun(attached, "EXECUTING", minute(3));
    const evaluated = transitionAuditRun(
      recordCompletedCase(executing, minute(4)),
      "EVALUATING",
      minute(5),
    );
    expect(() => transitionAuditRun(evaluated, "FINALIZING", minute(6))).toThrow(
      "score calculation",
    );
  });

  it("requires safe failures only for failed and interrupted transitions", () => {
    const planning = transitionAuditRun(makeRun(), "PLANNING", minute(1));
    expect(() => transitionAuditRun(planning, "FAILED", minute(2))).toThrow(ValidationError);
    expect(() =>
      transitionAuditRun(makeRun(), "PLANNING", minute(1), {
        code: "UNEXPECTED_FAILURE",
        summary: "Failure metadata is not valid while planning begins.",
      }),
    ).toThrow(ValidationError);
    expect(() =>
      transitionAuditRun(planning, "FAILED", minute(2), {
        code: "BAD\nCODE",
        summary: "The failure is safe.",
      }),
    ).toThrow("single-line");

    const failed = transitionAuditRun(planning, "FAILED", minute(2), {
      code: "  PLAN_FAILED  ",
      summary: "  The plan could not be built safely.  ",
    });
    expect(failed).toMatchObject({
      completedAt: minute(2),
      failure: { code: "PLAN_FAILED", summary: "The plan could not be built safely." },
      status: "FAILED",
    });
  });

  it("protects phase, progress, and timestamp monotonicity", () => {
    const planning = transitionAuditRun(makeRun(), "PLANNING", minute(1));
    expect(() => advanceAuditPhase(planning, "CALCULATING_SCORES", minute(2))).toThrow(
      "Invalid audit phase transition",
    );
    expect(() =>
      advanceAuditPhase(
        { ...planning, currentPhase: "EVALUATING_RESULTS", status: "EXECUTING" },
        "CORRELATING_FINDINGS",
        minute(2),
      ),
    ).toThrow("not valid while run status");
    expect(() =>
      transitionAuditRun(planning, "INTERRUPTED", minute(0), {
        code: "LEASE_EXPIRED",
        summary: "The lease expired.",
      }),
    ).toThrow("timestamps cannot move backwards");
    expect(() => recordCompletedCase(planning, minute(2))).toThrow("only while executing");

    const attached = attachLockedAuditPlan(
      planning,
      {
        fingerprint: testFingerprintService.sha256("plan"),
        id: auditPlanId("audit_plan_1"),
        kind: "PRIMARY",
        plannedCaseCount: 1,
        status: "LOCKED",
      },
      minute(2),
    );
    const completeProgress = recordCompletedCase(
      transitionAuditRun(attached, "EXECUTING", minute(3)),
      minute(4),
    );
    expect(() => recordCompletedCase(completeProgress, minute(5))).toThrow(
      "cannot exceed planned case count",
    );
  });

  it("makes repeated cancellation requests idempotent and exposes the policy facade", () => {
    const policy = new AuditStateTransitionPolicy();
    const planning = policy.transition(makeRun(), "PLANNING", minute(1));
    const cancelling = policy.requestCancellation(planning, minute(2));

    expect(requestAuditCancellation(cancelling, minute(3))).toBe(cancelling);
    expect(policy.transition(cancelling, "CANCELLED", minute(3))).toMatchObject({
      completedAt: minute(3),
      status: "CANCELLED",
    });
  });
});

describe("TestExecution defensive lifecycle", () => {
  it("validates attempts, seeds, and start chronology", () => {
    expect(() => pendingExecution({ attempt: 0 })).toThrow("positive integer");
    expect(() => pendingExecution({ seed: "   " })).toThrow("1 to 200 characters");

    const pending = pendingExecution();
    expect(() => startTestExecution(pending, minute(9))).toThrow("start cannot precede creation");
    const running = startTestExecution(pending, minute(11));
    expect(() => startTestExecution(running, minute(12))).toThrow("Only a pending test execution");
  });

  it("requires unique evidence and non-negative integer usage on completion", () => {
    const running = startTestExecution(pendingExecution(), minute(11));
    expect(() => completeTestExecution(running, "PASS", [], zeroUsage, minute(12))).toThrow(
      "requires evidence",
    );
    expect(() =>
      completeTestExecution(running, "PASS", ["evidence_1", "evidence_1"], zeroUsage, minute(12)),
    ).toThrow("must be unique");
    expect(() =>
      completeTestExecution(
        running,
        "PASS",
        ["evidence_1"],
        { ...zeroUsage, modelOutputTokens: -1 },
        minute(12),
      ),
    ).toThrow("non-negative integer");
    expect(() =>
      completeTestExecution(
        running,
        "PASS",
        ["evidence_1"],
        { ...zeroUsage, toolAttempts: 1.5 },
        minute(12),
      ),
    ).toThrow("non-negative integer");
  });

  it("enforces terminal chronology for each terminal outcome", () => {
    expect(() => skipTestExecution(pendingExecution(), "NON_APPLICABLE", minute(9))).toThrow(
      "completion cannot precede creation",
    );
    expect(() => cancelTestExecution(pendingExecution(), minute(9))).toThrow(
      "completion cannot precede creation",
    );
    expect(() =>
      interruptTestExecution(
        startTestExecution(pendingExecution(), minute(11)),
        "LEASE_EXPIRED",
        zeroUsage,
        minute(9),
      ),
    ).toThrow("completion cannot precede creation");
  });

  it("selects attempts only within one completed run/case history", () => {
    expect(() => selectEffectiveExecution([])).toThrow("At least one execution attempt");

    const first = skipTestExecution(pendingExecution(), "NON_APPLICABLE", minute(11));
    const differentCase = skipTestExecution(
      pendingExecution({ auditTestCaseId: "test_case_2", id: "execution_2" }),
      "NON_APPLICABLE",
      minute(11),
    );
    expect(() => selectEffectiveExecution([first, differentCase])).toThrow("one run and case");

    const sameAttempt = skipTestExecution(
      pendingExecution({ id: "execution_3" }),
      "NON_APPLICABLE",
      minute(11),
    );
    expect(() => selectEffectiveExecution([first, sameAttempt])).toThrow(
      "attempt numbers must be unique",
    );
    expect(() => selectEffectiveExecution([first, pendingExecution({ attempt: 2 })])).toThrow(
      "while an attempt is active",
    );
  });

  it("prefers any completed attempt, otherwise the latest terminal attempt", () => {
    const interrupted = interruptTestExecution(
      startTestExecution(pendingExecution(), minute(11)),
      "LEASE_EXPIRED",
      zeroUsage,
      minute(12),
    );
    const completed = completeTestExecution(
      startTestExecution(pendingExecution({ attempt: 2, id: "execution_2" }), minute(13)),
      "WARNING",
      ["evidence_1"],
      zeroUsage,
      minute(14),
    );
    const laterError = errorTestExecution(
      startTestExecution(pendingExecution({ attempt: 3, id: "execution_3" }), minute(15)),
      "PROVIDER_UNAVAILABLE",
      zeroUsage,
      minute(16),
    );

    expect(selectEffectiveExecution([laterError, interrupted, completed])).toBe(completed);
    expect(selectEffectiveExecution([interrupted, laterError])).toBe(laterError);
  });
});

describe("evidence and result count invariants", () => {
  it("accepts only positive trace sequences and ordered evidence ranges", () => {
    const eventInput = {
      actor: "POLICY" as const,
      occurredAt: minute(1),
      payload: { decision: "DENY" },
      payloadSchemaVersion: versionIdentifier("1.0.0"),
      type: "PERMISSION_DECISION" as const,
    };
    expect(() => createTraceEvent(eventInput, 0)).toThrow(ValidationError);
    expect(() => createTraceEvent(eventInput, 1.5)).toThrow(ValidationError);

    const evidenceInput = {
      auditRunId: "audit_run_1",
      contentDigest: contentDigest(testFingerprintService.sha256("evidence")),
      createdAt: minute(2),
      id: "evidence_1",
      kind: "PERMISSION_DECISION" as const,
      redactionApplied: false,
      sanitizedExcerpt: "  Permission denied for the out-of-scope record.  ",
      sourceSequenceEnd: 2,
      sourceSequenceStart: 1,
      testExecutionId: "execution_1",
    };
    expect(createEvidenceRecord(evidenceInput)).toMatchObject({
      sanitizedExcerpt: "Permission denied for the out-of-scope record.",
      sourceSequenceEnd: 2,
      sourceSequenceStart: 1,
    });
    expect(() => createEvidenceRecord({ ...evidenceInput, sourceSequenceStart: 0 })).toThrow(
      InvariantViolation,
    );
    expect(() =>
      createEvidenceRecord({ ...evidenceInput, sourceSequenceEnd: 1, sourceSequenceStart: 2 }),
    ).toThrow(InvariantViolation);
    expect(() => createEvidenceRecord({ ...evidenceInput, sanitizedExcerpt: "   " })).toThrow(
      ValidationError,
    );
    expect(() =>
      createEvidenceRecord({ ...evidenceInput, sanitizedExcerpt: "x".repeat(2_001) }),
    ).toThrow(ValidationError);

    const staticEvidence = createEvidenceRecord({
      auditRunId: "audit_run_1",
      contentDigest: contentDigest(testFingerprintService.sha256("static evidence")),
      createdAt: minute(2),
      id: "static_evidence_1",
      kind: "TRANSCRIPT_OBSERVATION",
      redactionApplied: false,
      sanitizedExcerpt: "A deterministic revision-level observation.",
    });
    expect(staticEvidence.testExecutionId).toBeUndefined();
    expect(staticEvidence.sourceSequenceStart).toBeUndefined();
  });

  it("counts every terminal execution category without mutating prior counts", () => {
    const base: Omit<NormalizedScoringCase, "outcome" | "status"> = {
      classification: "SECURITY",
      primaryDimension: "PERMISSION_CONTROL",
      severity: "HIGH",
      stableTestKey: stableTestKey("mandatory:permission-boundary"),
    };
    const results: readonly NormalizedScoringCase[] = [
      { ...base, outcome: "PASS", status: "COMPLETED" },
      { ...base, outcome: "WARNING", status: "COMPLETED" },
      { ...base, outcome: "FAIL", status: "COMPLETED" },
      { ...base, outcome: "INCONCLUSIVE", status: "COMPLETED" },
      { ...base, status: "ERRORED" },
      { ...base, skipReason: "NON_APPLICABLE", status: "SKIPPED" },
      { ...base, status: "CANCELLED" },
      { ...base, status: "INTERRUPTED" },
      { ...base, status: "RUNNING" },
    ];
    const empty = emptyResultCounts();
    const counted = results.reduce(addResult, empty);

    expect(counted).toEqual({
      cancelled: 1,
      error: 1,
      fail: 1,
      inconclusive: 1,
      interrupted: 1,
      pass: 1,
      skipped: 1,
      warning: 1,
    });
    expect(empty).toEqual(emptyResultCounts());
    expect(() => addResult(empty, { ...base, status: "COMPLETED" })).toThrow(InvariantViolation);
  });
});
