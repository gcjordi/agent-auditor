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
import type { AgentRevisionId, CapabilityKey } from "../../agent-catalog/domain";
import { type AuditPlanId, auditPlanId, type AuditTestCaseId, auditTestCaseId } from "./ids";
import {
  type RiskCategory,
  riskCategory,
  type ScoreDimension,
  type Severity,
  type StableTestKey,
  stableTestKey,
} from "./taxonomy";

export type AuditPlanKind = "PRIMARY" | "SUPPLEMENTAL";
export type AuditPlanStatus = "ABANDONED" | "BUILDING" | "LOCKED";
export type AuditTestSource =
  "ADAPTIVE" | "CAPABILITY" | "INTERACTION" | "MANDATORY" | "SUPPLEMENTAL";
export type TestClassification = "SECURITY" | "UTILITY";

export interface AuditBudget {
  readonly maxCases: number;
  readonly maxDurationMs: number;
  readonly maxInteractionStepsPerCase: number;
  readonly maxToolAttemptsPerCase: number;
}

export interface DeterministicOracleDefinition {
  readonly kind: "DETERMINISTIC_ASSERTION" | "SEMANTIC_EVALUATION";
  readonly version: VersionIdentifier;
  readonly assertionKeys: readonly string[];
  readonly expectedBehavior: string;
}

export interface AuditTestCase {
  readonly id: AuditTestCaseId;
  readonly stableKey: StableTestKey;
  readonly title: string;
  readonly category: RiskCategory;
  readonly rationale: string;
  readonly severity: Severity;
  readonly primaryDimension: ScoreDimension;
  readonly classification: TestClassification;
  readonly applicableCapabilityKeys: readonly CapabilityKey[];
  readonly maxInteractionSteps: number;
  readonly oracle: DeterministicOracleDefinition;
  readonly source: AuditTestSource;
  readonly version: VersionIdentifier;
  readonly ordinal: number;
  readonly definitionFingerprint: Fingerprint;
}

export interface AuditTestCaseInput {
  readonly id: string;
  readonly stableKey: string;
  readonly title: string;
  readonly category: string;
  readonly rationale: string;
  readonly severity: Severity;
  readonly primaryDimension: ScoreDimension;
  readonly classification: TestClassification;
  readonly applicableCapabilityKeys: readonly CapabilityKey[];
  readonly maxInteractionSteps: number;
  readonly oracle: {
    readonly kind: "DETERMINISTIC_ASSERTION" | "SEMANTIC_EVALUATION";
    readonly version: string;
    readonly assertionKeys: readonly string[];
    readonly expectedBehavior: string;
  };
  readonly source: AuditTestSource;
  readonly version: string;
}

export interface CoverageLimitation {
  readonly capabilityKey: CapabilityKey;
  readonly impact: "CRITICAL" | "HIGH";
  readonly reasonCode: "BUDGET_BOUNDARY" | "MISSING_TEMPLATE" | "UNSUPPORTED_CAPABILITY";
  readonly explanation: string;
}

export interface AuditPlan {
  readonly id: AuditPlanId;
  readonly agentRevisionId: AgentRevisionId;
  readonly targetFingerprint: Fingerprint;
  readonly kind: AuditPlanKind;
  readonly status: AuditPlanStatus;
  readonly seed: string;
  readonly engineVersion: VersionIdentifier;
  readonly taxonomyVersion: VersionIdentifier;
  readonly templateVersion: VersionIdentifier;
  readonly evaluationPolicyVersion: VersionIdentifier;
  readonly scoringPolicyVersion: VersionIdentifier;
  readonly fixtureVersion: VersionIdentifier;
  readonly budgetSchemaVersion: VersionIdentifier;
  readonly budget: AuditBudget;
  readonly testCases: readonly AuditTestCase[];
  readonly coverageSchemaVersion: VersionIdentifier;
  readonly coverageLimitations: readonly CoverageLimitation[];
  readonly fingerprint?: Fingerprint;
  readonly createdAt: UtcTimestamp;
  readonly lockedAt?: UtcTimestamp;
  readonly abandonedAt?: UtcTimestamp;
}

export interface CreateAuditPlanInput extends Omit<
  AuditPlan,
  "abandonedAt" | "fingerprint" | "id" | "lockedAt" | "status" | "testCases"
> {
  readonly id: string;
  readonly testCases?: readonly AuditTestCase[];
}

function boundedText(value: string, field: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new ValidationError(`${field} must contain 1 to ${maximum} characters.`, field);
  }
  return normalized;
}

function validateBudget(budget: AuditBudget): AuditBudget {
  const limits: Readonly<Record<keyof AuditBudget, number>> = {
    maxCases: 200,
    maxDurationMs: 3_600_000,
    maxInteractionStepsPerCase: 50,
    maxToolAttemptsPerCase: 50,
  };
  for (const [field, maximum] of Object.entries(limits) as [keyof AuditBudget, number][]) {
    const value = budget[field];
    if (!Number.isSafeInteger(value) || value < 1 || value > maximum) {
      throw new ValidationError(`${field} must be an integer between 1 and ${maximum}.`, field);
    }
  }
  return { ...budget };
}

export function createAuditTestCase(
  input: AuditTestCaseInput,
  ordinal: number,
  service: FingerprintService,
): AuditTestCase {
  if (
    !Number.isSafeInteger(input.maxInteractionSteps) ||
    input.maxInteractionSteps < 1 ||
    input.maxInteractionSteps > 50
  ) {
    throw new ValidationError(
      "A test case may contain between 1 and 50 interaction steps.",
      "maxInteractionSteps",
    );
  }
  if (
    (input.classification === "UTILITY") !==
    (input.primaryDimension === "UTILITY_PRESERVATION")
  ) {
    throw new ValidationError(
      "Utility classification and the utility dimension must be used together.",
      "classification",
    );
  }

  const assertionKeys = input.oracle.assertionKeys.map((key) =>
    boundedText(key, "oracle.assertionKeys", 100),
  );
  if (new Set(assertionKeys).size !== assertionKeys.length) {
    throw new ValidationError("Oracle assertion keys must be unique.", "oracle.assertionKeys");
  }
  if (input.oracle.kind === "DETERMINISTIC_ASSERTION" && assertionKeys.length === 0) {
    throw new ValidationError(
      "A deterministic oracle requires at least one assertion key.",
      "oracle.assertionKeys",
    );
  }

  const fingerprintInput = {
    applicableCapabilityKeys: [...input.applicableCapabilityKeys],
    category: riskCategory(input.category),
    classification: input.classification,
    maxInteractionSteps: input.maxInteractionSteps,
    oracle: {
      assertionKeys,
      expectedBehavior: boundedText(
        input.oracle.expectedBehavior,
        "oracle.expectedBehavior",
        2_000,
      ),
      kind: input.oracle.kind,
      version: versionIdentifier(input.oracle.version),
    },
    primaryDimension: input.primaryDimension,
    rationale: boundedText(input.rationale, "rationale", 2_000),
    severity: input.severity,
    source: input.source,
    stableKey: stableTestKey(input.stableKey),
    title: boundedText(input.title, "title", 200),
    version: versionIdentifier(input.version),
  };

  return deepFreeze({
    ...fingerprintInput,
    definitionFingerprint: fingerprintCanonical(fingerprintInput, service),
    id: auditTestCaseId(input.id),
    ordinal,
  });
}

export function createAuditPlan(input: CreateAuditPlanInput): AuditPlan {
  const budget = validateBudget(input.budget);
  const testCases = [...(input.testCases ?? [])];
  if (testCases.length > budget.maxCases) {
    throw new ValidationError("Audit plan exceeds its case budget.", "testCases");
  }

  return deepFreeze({
    ...input,
    budget,
    id: auditPlanId(input.id),
    status: "BUILDING" as const,
    testCases,
  });
}

export function addAuditTestCase(plan: AuditPlan, testCase: AuditTestCase): AuditPlan {
  if (plan.status !== "BUILDING") {
    throw new InvariantViolation("Only a building audit plan can accept test cases.");
  }
  if (plan.testCases.length >= plan.budget.maxCases) {
    throw new InvariantViolation("Audit plan case budget is exhausted.");
  }
  if (plan.testCases.some((existing) => existing.stableKey === testCase.stableKey)) {
    throw new ValidationError("Stable test keys must be unique within a plan.", "stableKey");
  }

  return deepFreeze({
    ...plan,
    testCases: [...plan.testCases, { ...testCase, ordinal: plan.testCases.length }],
  });
}

export function auditPlanFingerprintInput(plan: AuditPlan): unknown {
  return {
    budget: plan.budget,
    budgetSchemaVersion: plan.budgetSchemaVersion,
    coverageLimitations: plan.coverageLimitations,
    coverageSchemaVersion: plan.coverageSchemaVersion,
    engineVersion: plan.engineVersion,
    evaluationPolicyVersion: plan.evaluationPolicyVersion,
    fixtureVersion: plan.fixtureVersion,
    kind: plan.kind,
    scoringPolicyVersion: plan.scoringPolicyVersion,
    seed: plan.seed,
    targetFingerprint: plan.targetFingerprint,
    taxonomyVersion: plan.taxonomyVersion,
    templateVersion: plan.templateVersion,
    testCases: plan.testCases.map((testCase) => ({
      definitionFingerprint: testCase.definitionFingerprint,
      ordinal: testCase.ordinal,
      stableKey: testCase.stableKey,
    })),
  };
}

export function lockAuditPlan(
  plan: AuditPlan,
  lockedAt: UtcTimestamp,
  service: FingerprintService,
): AuditPlan {
  if (plan.status !== "BUILDING") {
    throw new InvariantViolation("Only a building audit plan can be locked.");
  }
  if (plan.testCases.length === 0) {
    throw new InvariantViolation("An audit plan must contain at least one test before locking.");
  }
  if (
    new Set(plan.testCases.map((testCase) => testCase.stableKey)).size !== plan.testCases.length
  ) {
    throw new InvariantViolation("A plan cannot lock with duplicate stable test keys.");
  }

  return deepFreeze({
    ...plan,
    fingerprint: fingerprintCanonical(auditPlanFingerprintInput(plan), service),
    lockedAt,
    status: "LOCKED" as const,
  });
}

export function abandonAuditPlan(plan: AuditPlan, abandonedAt: UtcTimestamp): AuditPlan {
  if (plan.status !== "BUILDING") {
    throw new InvariantViolation("Only a building audit plan can be abandoned.");
  }
  return deepFreeze({ ...plan, abandonedAt, status: "ABANDONED" as const });
}
