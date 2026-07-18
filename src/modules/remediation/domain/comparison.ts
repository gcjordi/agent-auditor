import {
  canonicalSerialize,
  deepFreeze,
  type Fingerprint,
  type UtcTimestamp,
} from "../../../shared/domain";
import type { AgentRevisionId } from "../../agent-catalog/domain";
import type { AuditRun, AuditRunId, StableTestKey, TestOutcome } from "../../auditing/domain";

export type ComparisonCompatibilityReason =
  | "BASELINE_NOT_COMPLETED"
  | "BASELINE_PURPOSE_INVALID"
  | "BUDGET_MISMATCH"
  | "ENGINE_VERSION_MISMATCH"
  | "EVALUATION_POLICY_VERSION_MISMATCH"
  | "FIXTURE_VERSION_MISMATCH"
  | "LIVE_MODEL_MISMATCH"
  | "LIVE_REQUEST_PROFILE_MISMATCH"
  | "MODE_MISMATCH"
  | "PLAN_FINGERPRINT_MISMATCH"
  | "SCORING_POLICY_VERSION_MISMATCH"
  | "SEED_MISMATCH"
  | "TAXONOMY_VERSION_MISMATCH"
  | "VERIFICATION_BASELINE_MISMATCH"
  | "VERIFICATION_NOT_COMPLETED"
  | "VERIFICATION_REVISION_NOT_DESCENDANT";

export type ComparisonCompatibility =
  | { readonly compatible: true }
  | {
      readonly compatible: false;
      readonly reasons: readonly ComparisonCompatibilityReason[];
    };

export interface ComparisonContext {
  readonly baseline: AuditRun;
  readonly verification: AuditRun;
  readonly verificationRevisionAncestorIds: readonly AgentRevisionId[];
}

function sameVersion(left: string, right: string): boolean {
  return left === right;
}

export function checkComparisonCompatibility(context: ComparisonContext): ComparisonCompatibility {
  const { baseline, verification } = context;
  const reasons: ComparisonCompatibilityReason[] = [];

  if (baseline.status !== "COMPLETED") reasons.push("BASELINE_NOT_COMPLETED");
  if (baseline.runPurpose !== "BASELINE") reasons.push("BASELINE_PURPOSE_INVALID");
  if (verification.status !== "COMPLETED") reasons.push("VERIFICATION_NOT_COMPLETED");
  if (verification.runPurpose !== "VERIFICATION" || verification.baselineRunId !== baseline.id) {
    reasons.push("VERIFICATION_BASELINE_MISMATCH");
  }
  if (!context.verificationRevisionAncestorIds.includes(baseline.agentRevisionId)) {
    reasons.push("VERIFICATION_REVISION_NOT_DESCENDANT");
  }
  if (
    baseline.auditPlanFingerprint === undefined ||
    verification.auditPlanFingerprint === undefined ||
    baseline.auditPlanFingerprint !== verification.auditPlanFingerprint
  ) {
    reasons.push("PLAN_FINGERPRINT_MISMATCH");
  }
  if (!sameVersion(baseline.engineVersion, verification.engineVersion)) {
    reasons.push("ENGINE_VERSION_MISMATCH");
  }
  if (!sameVersion(baseline.evaluationPolicyVersion, verification.evaluationPolicyVersion)) {
    reasons.push("EVALUATION_POLICY_VERSION_MISMATCH");
  }
  if (!sameVersion(baseline.scoringPolicyVersion, verification.scoringPolicyVersion)) {
    reasons.push("SCORING_POLICY_VERSION_MISMATCH");
  }
  if (!sameVersion(baseline.taxonomyVersion, verification.taxonomyVersion)) {
    reasons.push("TAXONOMY_VERSION_MISMATCH");
  }
  if (!sameVersion(baseline.fixtureVersion, verification.fixtureVersion)) {
    reasons.push("FIXTURE_VERSION_MISMATCH");
  }
  if (baseline.mode !== verification.mode) reasons.push("MODE_MISMATCH");
  if (baseline.seed !== verification.seed) reasons.push("SEED_MISMATCH");
  if (canonicalSerialize(baseline.budget) !== canonicalSerialize(verification.budget)) {
    reasons.push("BUDGET_MISMATCH");
  }
  if (baseline.mode === "LIVE" && verification.mode === "LIVE") {
    if (
      baseline.liveConfiguration?.modelReference !== verification.liveConfiguration?.modelReference
    ) {
      reasons.push("LIVE_MODEL_MISMATCH");
    }
    if (
      baseline.liveConfiguration?.modelRequestProfileDigest !==
      verification.liveConfiguration?.modelRequestProfileDigest
    ) {
      reasons.push("LIVE_REQUEST_PROFILE_MISMATCH");
    }
  }

  return reasons.length === 0
    ? { compatible: true }
    : deepFreeze({ compatible: false, reasons: [...new Set(reasons)] });
}

export type CaseComparisonClassification =
  "IMPROVED" | "INCONCLUSIVE" | "REGRESSED" | "UNCHANGED" | "UNPAIRED";

export interface ComparableCaseResult {
  readonly stableTestKey: StableTestKey;
  readonly definitionFingerprint: Fingerprint;
  readonly outcome?: TestOutcome;
}

const RISK_RANK: Readonly<Record<Exclude<TestOutcome, "INCONCLUSIVE">, number>> = {
  FAIL: 2,
  PASS: 0,
  WARNING: 1,
};

export function classifyCaseComparison(
  baseline: ComparableCaseResult | undefined,
  verification: ComparableCaseResult | undefined,
): CaseComparisonClassification {
  if (
    baseline === undefined ||
    verification === undefined ||
    baseline.stableTestKey !== verification.stableTestKey ||
    baseline.definitionFingerprint !== verification.definitionFingerprint
  ) {
    return "UNPAIRED";
  }
  if (
    baseline.outcome === undefined ||
    verification.outcome === undefined ||
    baseline.outcome === "INCONCLUSIVE" ||
    verification.outcome === "INCONCLUSIVE"
  ) {
    return "INCONCLUSIVE";
  }

  const baselineRank = RISK_RANK[baseline.outcome];
  const verificationRank = RISK_RANK[verification.outcome];
  return verificationRank < baselineRank
    ? "IMPROVED"
    : verificationRank > baselineRank
      ? "REGRESSED"
      : "UNCHANGED";
}

export interface AuditComparisonFoundation {
  readonly baselineAuditRunId: AuditRunId;
  readonly verificationAuditRunId: AuditRunId;
  readonly compatibility: ComparisonCompatibility;
  readonly createdAt: UtcTimestamp;
}

export function createAuditComparisonFoundation(
  context: ComparisonContext,
  createdAt: UtcTimestamp,
): AuditComparisonFoundation {
  return deepFreeze({
    baselineAuditRunId: context.baseline.id,
    compatibility: checkComparisonCompatibility(context),
    createdAt,
    verificationAuditRunId: context.verification.id,
  });
}
