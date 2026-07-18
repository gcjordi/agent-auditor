import { describe, expect, it } from "vitest";

import {
  agentRevisionId,
  capabilityKey,
  permissionGrantId,
  toolDefinitionId,
} from "@/modules/agent-catalog/domain";
import {
  advanceAuditPhase,
  attachLockedAuditPlan,
  auditPlanId,
  type AuditRun,
  auditRunId,
  findingId,
  recordCompletedCase,
  stableTestKey,
  transitionAuditRun,
} from "@/modules/auditing/domain";
import {
  applyGuardrailSet,
  beginGuardrailReview,
  checkComparisonCompatibility,
  classifyCaseComparison,
  type ComparisonCompatibilityReason,
  createAuditComparisonFoundation,
  createGuardrailProposal,
  createGuardrailSet,
  decideGuardrailProposal,
  deriveCandidateRevisionDraft,
  type GuardrailChange,
  type GuardrailProposal,
  guardrailProposalId,
  type GuardrailProposalInput,
  type GuardrailSet,
  markCandidateDraftReviewed,
  markGuardrailSetReady,
  rejectGuardrailSet,
} from "@/modules/remediation/domain";
import {
  contentDigest,
  InvariantViolation,
  utcTimestamp,
  ValidationError,
  versionIdentifier,
} from "@/shared/domain";

import { makeRevision, makeRun, testFingerprintService } from "./domain-builders";

const minute = (value: number) =>
  utcTimestamp(`2026-07-18T15:${value.toString().padStart(2, "0")}:00.000Z`);

function proposalFor(
  sourceFingerprint: ReturnType<typeof testFingerprintService.sha256>,
  id: string,
  change: GuardrailChange,
  overrides: Partial<GuardrailProposalInput> = {},
): GuardrailProposal {
  return createGuardrailProposal({
    expectedEffect: "Reduces the observed behavioral security risk.",
    expectedSourceFingerprint: sourceFingerprint,
    id,
    linkedFindingIds: [findingId(`finding_${id}`)],
    priority: 100,
    proposedChange: change,
    rationale: "The audit evidence supports a narrower behavior boundary.",
    riskOfBehaviorChange: "LOW",
    title: `Guardrail ${id}`,
    tradeOffs: "Some ambiguous requests may be refused.",
    ...overrides,
  });
}

function proposedSet(
  source: ReturnType<typeof makeRevision>,
  proposals: readonly GuardrailProposal[],
): GuardrailSet {
  return createGuardrailSet({
    createdAt: minute(0),
    id: "guardrail_set_1",
    proposals,
    sourceAgentRevisionId: source.id,
    sourceAuditRunId: auditRunId("audit_run_1"),
    sourceAuditStatus: "COMPLETED",
    sourceRevisionFingerprint: source.fingerprint,
  });
}

function readySetFor(
  source: ReturnType<typeof makeRevision>,
  changes: readonly GuardrailChange[],
): GuardrailSet {
  const proposals = changes.map((change, index) =>
    proposalFor(source.fingerprint, `proposal_${index + 1}`, change),
  );
  let set = beginGuardrailReview(proposedSet(source, proposals), minute(1));
  for (const [index, proposal] of proposals.entries()) {
    set = decideGuardrailProposal(set, proposal.id, "ACCEPTED", minute(index + 2));
  }
  return markGuardrailSetReady(set, minute(changes.length + 2));
}

function completedRun(options: {
  id: string;
  revisionId: string;
  baselineRunId?: string;
}): AuditRun {
  let run = makeRun({
    ...(options.baselineRunId === undefined
      ? {}
      : {
          baselineRunId: auditRunId(options.baselineRunId),
          runPurpose: "VERIFICATION" as const,
        }),
    agentRevisionId: agentRevisionId(options.revisionId),
    id: options.id,
    idempotencyKey: `request-${options.id}`,
  });
  run = transitionAuditRun(run, "PLANNING", minute(1));
  run = attachLockedAuditPlan(
    run,
    {
      fingerprint: testFingerprintService.sha256("shared-plan"),
      id: auditPlanId(`plan_${options.id}`),
      kind: "PRIMARY",
      plannedCaseCount: 1,
      status: "LOCKED",
    },
    minute(2),
  );
  run = transitionAuditRun(run, "EXECUTING", minute(3));
  run = recordCompletedCase(run, minute(4));
  run = transitionAuditRun(run, "EVALUATING", minute(5));
  run = advanceAuditPhase(run, "CORRELATING_FINDINGS", minute(6));
  run = advanceAuditPhase(run, "CALCULATING_SCORES", minute(7));
  run = transitionAuditRun(run, "FINALIZING", minute(8));
  return transitionAuditRun(run, "COMPLETED", minute(9));
}

describe("guardrail proposal and set invariants", () => {
  it("normalizes reviewer-facing rationale and accepts defense-in-depth proposals", () => {
    const source = makeRevision();
    const proposal = proposalFor(
      source.fingerprint,
      "proposal_1",
      {
        replacementSystemPrompt: "  Preserve the declared instruction boundary.  ",
        type: "SYSTEM_PROMPT_CHANGE",
      },
      {
        defenseInDepthRationale: "  Adds a preventive boundary before exploitation.  ",
        expectedEffect: "  Reduces ambiguity.  ",
        linkedFindingIds: [],
        priority: 0,
        rationale: "  Preventive hardening.  ",
        title: "  Explicit boundary  ",
        tradeOffs: "  May refuse ambiguity.  ",
      },
    );

    expect(proposal).toMatchObject({
      defenseInDepthRationale: "Adds a preventive boundary before exploitation.",
      expectedEffect: "Reduces ambiguity.",
      priority: 0,
      proposedChange: { replacementSystemPrompt: "Preserve the declared instruction boundary." },
      rationale: "Preventive hardening.",
      title: "Explicit boundary",
      tradeOffs: "May refuse ambiguity.",
    });
  });

  it("validates evidence linkage, priorities, unique findings, and bounded prose", () => {
    const source = makeRevision();
    const change: GuardrailChange = {
      replacementSystemPrompt: "Preserve the declared instruction boundary.",
      type: "SYSTEM_PROMPT_CHANGE",
    };

    expect(() =>
      proposalFor(source.fingerprint, "proposal_1", change, {
        defenseInDepthRationale: "   ",
        linkedFindingIds: [],
      }),
    ).toThrow(InvariantViolation);
    expect(() =>
      proposalFor(source.fingerprint, "proposal_1", change, {
        linkedFindingIds: [findingId("finding_1"), findingId("finding_1")],
      }),
    ).toThrow("must be unique");
    expect(() => proposalFor(source.fingerprint, "proposal_1", change, { priority: -1 })).toThrow(
      "between 0 and 1,000",
    );
    expect(() => proposalFor(source.fingerprint, "proposal_1", change, { priority: 1.5 })).toThrow(
      "between 0 and 1,000",
    );
    expect(() => proposalFor(source.fingerprint, "proposal_1", change, { title: "   " })).toThrow(
      ValidationError,
    );
  });

  it("rejects malformed permission reductions before review", () => {
    const source = makeRevision();
    const permissionId = source.permissions[0]?.id;
    if (permissionId === undefined) throw new Error("Fixture permission is required.");

    expect(() =>
      proposalFor(source.fingerprint, "proposal_1", {
        action: "NARROW_SCOPE",
        permissionGrantId: permissionId,
        type: "PERMISSION_REDUCTION",
      }),
    ).toThrow("requires a replacement scope");
    expect(() =>
      proposalFor(source.fingerprint, "proposal_1", {
        action: "REMOVE",
        permissionGrantId: permissionId,
        replacementScope: { allSyntheticResources: false, resourceIds: [] },
        type: "PERMISSION_REDUCTION",
      }),
    ).toThrow("other actions must not include one");
    expect(() =>
      proposalFor(source.fingerprint, "proposal_1", {
        action: "NARROW_SCOPE",
        permissionGrantId: permissionId,
        replacementScope: {
          allSyntheticResources: true,
          resourceIds: ["record_1"],
        },
        type: "PERMISSION_REDUCTION",
      }),
    ).toThrow("cannot select all resources and named resources");
  });

  it("requires a non-empty, source-compatible proposal set", () => {
    const source = makeRevision();
    expect(() => proposedSet(source, [])).toThrow("requires at least one proposal");

    const proposal = proposalFor(source.fingerprint, "proposal_1", {
      replacementSystemPrompt: "Preserve the declared instruction boundary.",
      type: "SYSTEM_PROMPT_CHANGE",
    });
    expect(() => proposedSet(source, [proposal, proposal])).toThrow("IDs must be unique");

    const wrongFingerprintProposal = proposalFor(
      testFingerprintService.sha256("different-source"),
      "proposal_2",
      {
        replacementSystemPrompt: "Preserve the declared instruction boundary.",
        type: "SYSTEM_PROMPT_CHANGE",
      },
    );
    expect(() => proposedSet(source, [wrongFingerprintProposal])).toThrow(
      "target the set's source revision",
    );
  });

  it("enforces review state, monotonic timestamps, and one decision per proposal", () => {
    const source = makeRevision();
    const proposal = proposalFor(source.fingerprint, "proposal_1", {
      replacementSystemPrompt: "Preserve the declared instruction boundary.",
      type: "SYSTEM_PROMPT_CHANGE",
    });
    const proposed = proposedSet(source, [proposal]);
    expect(() => decideGuardrailProposal(proposed, proposal.id, "ACCEPTED", minute(1))).toThrow(
      "in-review set",
    );
    expect(() => beginGuardrailReview(proposed, minute(0))).not.toThrow();

    const reviewing = beginGuardrailReview(proposed, minute(1));
    expect(() => beginGuardrailReview(reviewing, minute(2))).toThrow("Only a proposed");
    expect(() =>
      decideGuardrailProposal(
        reviewing,
        guardrailProposalId("proposal_missing"),
        "ACCEPTED",
        minute(2),
      ),
    ).toThrow("not found");
    expect(() => decideGuardrailProposal(reviewing, proposal.id, "EDITED", minute(2))).toThrow(
      "requires an edited change",
    );
    expect(() =>
      decideGuardrailProposal(
        reviewing,
        proposal.id,
        "ACCEPTED",
        minute(2),
        proposal.proposedChange,
      ),
    ).toThrow("do not accept one");
    expect(() => decideGuardrailProposal(reviewing, proposal.id, "ACCEPTED", minute(0))).toThrow(
      "timestamps cannot move backwards",
    );

    const accepted = decideGuardrailProposal(reviewing, proposal.id, "ACCEPTED", minute(2));
    expect(() => decideGuardrailProposal(accepted, proposal.id, "REJECTED", minute(3))).toThrow(
      "cannot be decided again",
    );
  });

  it("supports edited decisions, whole-set rejection, and ready-set acceptance rules", () => {
    const source = makeRevision();
    const proposal = proposalFor(source.fingerprint, "proposal_1", {
      replacementSystemPrompt: "Initial proposed instruction.",
      type: "SYSTEM_PROMPT_CHANGE",
    });
    const reviewing = beginGuardrailReview(proposedSet(source, [proposal]), minute(1));
    const edited = decideGuardrailProposal(reviewing, proposal.id, "EDITED", minute(2), {
      replacementSystemPrompt: "Reviewed replacement instruction.",
      type: "SYSTEM_PROMPT_CHANGE",
    });
    expect(markGuardrailSetReady(edited, minute(3)).proposals[0]).toMatchObject({
      proposedChange: { replacementSystemPrompt: "Reviewed replacement instruction." },
      status: "EDITED",
    });

    const rejectedProposal = decideGuardrailProposal(reviewing, proposal.id, "REJECTED", minute(2));
    expect(() => markGuardrailSetReady(rejectedProposal, minute(3))).toThrow(
      "requires an accepted or edited proposal",
    );
    const rejectedSet = rejectGuardrailSet(reviewing, minute(2));
    expect(rejectedSet.status).toBe("REJECTED");
    expect(() => rejectGuardrailSet(rejectedSet, minute(3))).toThrow("Only an in-review");
    expect(() => applyGuardrailSet(rejectedSet, agentRevisionId("revision_2"), minute(3))).toThrow(
      "Only a ready guardrail set",
    );
  });
});

describe("candidate revision derivation", () => {
  it("applies each supported guardrail change without retaining persistence fingerprints", () => {
    const source = makeRevision();
    const toolId = source.tools[0]?.id;
    const permissionId = source.permissions[0]?.id;
    const capability = source.permissions[0]?.capabilityKey;
    if (toolId === undefined || permissionId === undefined || capability === undefined) {
      throw new Error("Fixture tool and permission are required.");
    }
    const changes: readonly GuardrailChange[] = [
      {
        replacementOperationalControls: { ...source.operationalControls, maxRetries: 2 },
        type: "OPERATIONAL_CONTROL",
      },
      {
        replacementSystemPrompt: "Preserve all declared permission and instruction boundaries.",
        type: "SYSTEM_PROMPT_CHANGE",
      },
      {
        replacementInputSchema: {
          additionalProperties: false,
          properties: {
            purpose: { minLength: 1, type: "string" },
            record_id: { minLength: 1, type: "string" },
          },
          required: ["record_id", "purpose"],
          type: "object",
        },
        toolDefinitionId: toolId,
        type: "TOOL_SCHEMA_CHANGE",
      },
      {
        action: "REQUIRE_CONFIRMATION",
        permissionGrantId: permissionId,
        type: "PERMISSION_REDUCTION",
      },
      { capabilityKey: capability, type: "CONFIRMATION_GATE" },
    ];

    const set = readySetFor(source, changes);
    const draft = deriveCandidateRevisionDraft("candidate_1", source, set, minute(10));

    expect(draft.definition).toMatchObject({
      operationalControls: {
        confirmationRequiredFor: ["records.read"],
        maxRetries: 2,
      },
      permissions: [{ requiresConfirmation: true }],
      systemPrompt: "Preserve all declared permission and instruction boundaries.",
    });
    expect(draft.definition.tools[0]?.inputSchema).toMatchObject({
      properties: { purpose: { type: "string" } },
    });
    expect("fingerprint" in (draft.definition.tools[0] ?? {})).toBe(false);
    expect("fingerprint" in (draft.definition.permissions[0] ?? {})).toBe(false);
    expect(draft.reviewedProposalIds).toHaveLength(changes.length);
  });

  it("removes and narrows permissions without mutating the source", () => {
    const source = makeRevision();
    const permissionId = source.permissions[0]?.id;
    if (permissionId === undefined) throw new Error("Fixture permission is required.");

    const removed = deriveCandidateRevisionDraft(
      "candidate_remove",
      source,
      readySetFor(source, [
        { action: "REMOVE", permissionGrantId: permissionId, type: "PERMISSION_REDUCTION" },
      ]),
      minute(5),
    );
    const narrowed = deriveCandidateRevisionDraft(
      "candidate_narrow",
      source,
      readySetFor(source, [
        {
          action: "NARROW_SCOPE",
          permissionGrantId: permissionId,
          replacementScope: { allSyntheticResources: false, resourceIds: [] },
          type: "PERMISSION_REDUCTION",
        },
      ]),
      minute(5),
    );

    expect(removed.definition.permissions).toEqual([]);
    expect(narrowed.definition.permissions[0]?.scope.resourceIds).toEqual([]);
    expect(source.permissions[0]?.scope.resourceIds).toEqual(["record_1"]);
  });

  it("rejects widening and references outside the immutable source revision", () => {
    const source = makeRevision();
    const permissionId = source.permissions[0]?.id;
    if (permissionId === undefined) throw new Error("Fixture permission is required.");

    expect(() =>
      deriveCandidateRevisionDraft(
        "candidate_widen",
        source,
        readySetFor(source, [
          {
            action: "NARROW_SCOPE",
            permissionGrantId: permissionId,
            replacementScope: {
              allSyntheticResources: false,
              resourceIds: ["record_1", "record_2"],
            },
            type: "PERMISSION_REDUCTION",
          },
        ]),
        minute(5),
      ),
    ).toThrow("cannot widen");
    expect(() =>
      deriveCandidateRevisionDraft(
        "candidate_unknown_tool",
        source,
        readySetFor(source, [
          {
            replacementInputSchema: source.tools[0]?.inputSchema ?? {
              additionalProperties: false,
              properties: {},
              required: [],
              type: "object",
            },
            toolDefinitionId: toolDefinitionId("tool_unknown"),
            type: "TOOL_SCHEMA_CHANGE",
          },
        ]),
        minute(5),
      ),
    ).toThrow("unknown tool definition");
    expect(() =>
      deriveCandidateRevisionDraft(
        "candidate_unknown_permission",
        source,
        readySetFor(source, [
          {
            action: "REMOVE",
            permissionGrantId: permissionGrantId("permission_unknown"),
            type: "PERMISSION_REDUCTION",
          },
        ]),
        minute(5),
      ),
    ).toThrow("unknown permission grant");
    expect(() =>
      deriveCandidateRevisionDraft(
        "candidate_unknown_capability",
        source,
        readySetFor(source, [
          { capabilityKey: capabilityKey("records.write"), type: "CONFIRMATION_GATE" },
        ]),
        minute(5),
      ),
    ).toThrow("without a permission grant");
  });

  it("requires ready, source-compatible, accepted changes and one review", () => {
    const source = makeRevision();
    const proposal = proposalFor(source.fingerprint, "proposal_1", {
      replacementSystemPrompt: "Preserve the declared instruction boundary.",
      type: "SYSTEM_PROMPT_CHANGE",
    });
    expect(() =>
      deriveCandidateRevisionDraft(
        "candidate_1",
        source,
        proposedSet(source, [proposal]),
        minute(1),
      ),
    ).toThrow("ready, reviewed guardrail set");

    const ready = readySetFor(source, [proposal.proposedChange]);
    const differentSource = makeRevision({ id: "agent_revision_2" });
    expect(() =>
      deriveCandidateRevisionDraft("candidate_1", differentSource, ready, minute(5)),
    ).toThrow("source does not match");

    const corrupted: GuardrailSet = {
      ...ready,
      proposals: ready.proposals.map((item) => ({ ...item, status: "REJECTED" })),
    };
    expect(() => deriveCandidateRevisionDraft("candidate_1", source, corrupted, minute(5))).toThrow(
      "at least one reviewed change",
    );

    const draft = deriveCandidateRevisionDraft("candidate_1", source, ready, minute(5));
    const reviewed = markCandidateDraftReviewed(draft, minute(6));
    expect(() => markCandidateDraftReviewed(reviewed, minute(7))).toThrow("already reviewed");
  });
});

describe("audit comparison compatibility", () => {
  it("reports every material provenance and lineage mismatch without duplicates", () => {
    const baseline = completedRun({ id: "baseline_run", revisionId: "agent_revision_1" });
    const verification = completedRun({
      baselineRunId: "baseline_run",
      id: "verification_run",
      revisionId: "agent_revision_2",
    });
    const { auditPlanFingerprint: _baselinePlanFingerprint, ...baselineWithoutPlan } = baseline;
    const incompatibleBaseline: AuditRun = {
      ...baselineWithoutPlan,
      runPurpose: "SUPPLEMENTAL",
      status: "FINALIZING",
    };
    const {
      auditPlanFingerprint: _verificationPlanFingerprint,
      baselineRunId: _verificationBaselineRunId,
      ...verificationWithoutPlanOrBaseline
    } = verification;
    const incompatibleVerification: AuditRun = {
      ...verificationWithoutPlanOrBaseline,
      budget: { ...verification.budget, maxCases: verification.budget.maxCases + 1 },
      engineVersion: versionIdentifier("2.0.0"),
      evaluationPolicyVersion: versionIdentifier("2.0.0"),
      fixtureVersion: versionIdentifier("2.0.0"),
      liveConfiguration: {
        liveConsentAt: minute(0),
        liveConsentVersion: versionIdentifier("1.0.0"),
        modelReference: "live-model",
        modelRequestProfile: {},
        modelRequestProfileDigest: contentDigest(testFingerprintService.sha256("profile")),
        modelRequestProfileSchemaVersion: versionIdentifier("1.0.0"),
        transmissionSummaryDigest: contentDigest(testFingerprintService.sha256("summary")),
      },
      mode: "LIVE",
      runPurpose: "BASELINE",
      scoringPolicyVersion: versionIdentifier("2.0.0"),
      seed: "different-seed",
      status: "FAILED",
      taxonomyVersion: versionIdentifier("2.0.0"),
    };

    const compatibility = checkComparisonCompatibility({
      baseline: incompatibleBaseline,
      verification: incompatibleVerification,
      verificationRevisionAncestorIds: [],
    });
    const expectedReasons: readonly ComparisonCompatibilityReason[] = [
      "BASELINE_NOT_COMPLETED",
      "BASELINE_PURPOSE_INVALID",
      "BUDGET_MISMATCH",
      "ENGINE_VERSION_MISMATCH",
      "EVALUATION_POLICY_VERSION_MISMATCH",
      "FIXTURE_VERSION_MISMATCH",
      "MODE_MISMATCH",
      "PLAN_FINGERPRINT_MISMATCH",
      "SCORING_POLICY_VERSION_MISMATCH",
      "SEED_MISMATCH",
      "TAXONOMY_VERSION_MISMATCH",
      "VERIFICATION_BASELINE_MISMATCH",
      "VERIFICATION_NOT_COMPLETED",
      "VERIFICATION_REVISION_NOT_DESCENDANT",
    ];
    if (compatibility.compatible) throw new Error("Expected an incompatible comparison.");
    for (const reason of expectedReasons) expect(compatibility.reasons).toContain(reason);
    expect(compatibility.reasons).toHaveLength(expectedReasons.length);
    expect(new Set(compatibility.reasons).size).toBe(compatibility.reasons.length);
  });

  it("compares exact live model and request-profile provenance", () => {
    const baseline = completedRun({ id: "baseline_run", revisionId: "agent_revision_1" });
    const verification = completedRun({
      baselineRunId: "baseline_run",
      id: "verification_run",
      revisionId: "agent_revision_2",
    });
    const liveConfiguration = {
      liveConsentAt: minute(0),
      liveConsentVersion: versionIdentifier("1.0.0"),
      modelReference: "live-model-a",
      modelRequestProfile: {},
      modelRequestProfileDigest: contentDigest(testFingerprintService.sha256("profile-a")),
      modelRequestProfileSchemaVersion: versionIdentifier("1.0.0"),
      transmissionSummaryDigest: contentDigest(testFingerprintService.sha256("summary")),
    } as const;

    expect(
      checkComparisonCompatibility({
        baseline: { ...baseline, liveConfiguration, mode: "LIVE" },
        verification: {
          ...verification,
          liveConfiguration: {
            ...liveConfiguration,
            modelReference: "live-model-b",
            modelRequestProfileDigest: contentDigest(testFingerprintService.sha256("profile-b")),
          },
          mode: "LIVE",
        },
        verificationRevisionAncestorIds: [baseline.agentRevisionId],
      }),
    ).toMatchObject({
      compatible: false,
      reasons: ["LIVE_MODEL_MISMATCH", "LIVE_REQUEST_PROFILE_MISMATCH"],
    });
  });

  it("classifies absent, incomparable, inconclusive, and unchanged case pairs", () => {
    const fingerprint = testFingerprintService.sha256("case-definition");
    const key = stableTestKey("mandatory:permission-boundary");
    const comparable = {
      definitionFingerprint: fingerprint,
      outcome: "WARNING" as const,
      stableTestKey: key,
    };

    expect(classifyCaseComparison(undefined, comparable)).toBe("UNPAIRED");
    expect(classifyCaseComparison(comparable, undefined)).toBe("UNPAIRED");
    expect(
      classifyCaseComparison(comparable, {
        ...comparable,
        stableTestKey: stableTestKey("mandatory:different-case"),
      }),
    ).toBe("UNPAIRED");
    expect(
      classifyCaseComparison(
        { definitionFingerprint: fingerprint, stableTestKey: key },
        comparable,
      ),
    ).toBe("INCONCLUSIVE");
    expect(classifyCaseComparison(comparable, { ...comparable, outcome: "INCONCLUSIVE" })).toBe(
      "INCONCLUSIVE",
    );
    expect(classifyCaseComparison(comparable, comparable)).toBe("UNCHANGED");
  });

  it("creates a comparison foundation with its compatibility decision", () => {
    const baseline = completedRun({ id: "baseline_run", revisionId: "agent_revision_1" });
    const verification = completedRun({
      baselineRunId: "baseline_run",
      id: "verification_run",
      revisionId: "agent_revision_2",
    });
    const comparison = createAuditComparisonFoundation(
      {
        baseline,
        verification,
        verificationRevisionAncestorIds: [baseline.agentRevisionId],
      },
      minute(10),
    );

    expect(comparison).toEqual({
      baselineAuditRunId: baseline.id,
      compatibility: { compatible: true },
      createdAt: minute(10),
      verificationAuditRunId: verification.id,
    });
  });
});
