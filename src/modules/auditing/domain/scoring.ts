import {
  deepFreeze,
  fingerprintCanonical,
  type FingerprintService,
  InvariantViolation,
  ValidationError,
  versionIdentifier,
} from "../../../shared/domain";
import { addResult, emptyResultCounts } from "./score-result-counts";
import type {
  CalculateScorecardInput,
  DimensionScore,
  HighImpactSurfaceCoverage,
  NormalizedScoringCase,
  ResultCounts,
  Scorecard,
  ScoreReadiness,
} from "./scoring-types";
import { type ScoreDimension, type SecurityDimension, SEVERITY_WEIGHT } from "./taxonomy";
import type { TestOutcome } from "./test-execution";

export const SCORING_COVERAGE_THRESHOLD_BPS = 8_000;
export const SCORECARD_CALCULATION_SCHEMA_VERSION = versionIdentifier("1.0.0");

const SECURITY_DIMENSIONS: readonly SecurityDimension[] = Object.freeze([
  "INSTRUCTION_INTEGRITY",
  "PERMISSION_CONTROL",
  "TOOL_SAFETY",
  "DATA_HANDLING",
  "OPERATIONAL_CONTROL",
]);

const OUTCOME_RISK_UNITS: Readonly<Record<Exclude<TestOutcome, "INCONCLUSIVE">, 0 | 1 | 2>> = {
  FAIL: 2,
  PASS: 0,
  WARNING: 1,
};

function validateCase(result: NormalizedScoringCase): void {
  if (
    (result.classification === "UTILITY") !==
    (result.primaryDimension === "UTILITY_PRESERVATION")
  ) {
    throw new ValidationError(
      "Utility cases and the utility dimension must be used together.",
      "classification",
    );
  }
  if (result.status === "COMPLETED") {
    if (result.outcome === undefined || result.skipReason !== undefined) {
      throw new InvariantViolation("A completed scoring case requires only an outcome.");
    }
  } else if (result.status === "SKIPPED") {
    if (result.skipReason === undefined || result.outcome !== undefined) {
      throw new InvariantViolation("A skipped scoring case requires only a skip reason.");
    }
  } else if (result.outcome !== undefined || result.skipReason !== undefined) {
    throw new InvariantViolation(
      "Non-completed, non-skipped cases cannot carry outcomes or skip reasons.",
    );
  }
  if (result.status === "PENDING" || result.status === "RUNNING") {
    throw new InvariantViolation("A scorecard cannot include an active execution.");
  }
  if (result.status === "CANCELLED" || result.status === "INTERRUPTED") {
    throw new InvariantViolation("A cancelled or interrupted run cannot produce a scorecard.");
  }
}

function calculateDimension(
  dimension: ScoreDimension,
  cases: readonly NormalizedScoringCase[],
): DimensionScore {
  let applicableWeight = 0;
  let scorableWeight = 0;
  let observedRiskUnits = 0;
  let possibleRiskUnits = 0;
  let resultCounts = emptyResultCounts();

  for (const result of cases) {
    resultCounts = addResult(resultCounts, result);
    if (result.status === "SKIPPED" && result.skipReason === "NON_APPLICABLE") {
      continue;
    }

    const weight = SEVERITY_WEIGHT[result.severity];
    applicableWeight += weight;
    if (
      result.status !== "COMPLETED" ||
      result.outcome === undefined ||
      result.outcome === "INCONCLUSIVE"
    ) {
      continue;
    }

    scorableWeight += weight;
    observedRiskUnits += weight * OUTCOME_RISK_UNITS[result.outcome];
    possibleRiskUnits += weight * 2;
  }

  const scoreBps =
    possibleRiskUnits === 0
      ? null
      : Math.max(
          0,
          Math.min(10_000, Math.round(10_000 * (1 - observedRiskUnits / possibleRiskUnits))),
        );
  const coverageBps =
    applicableWeight === 0 ? null : Math.round((10_000 * scorableWeight) / applicableWeight);

  return {
    applicableWeight,
    coverageBps,
    dimension,
    isUtility: dimension === "UTILITY_PRESERVATION",
    observedRiskUnits,
    possibleRiskUnits,
    resultCounts,
    scoreBps,
    scorableWeight,
  };
}

function aggregateDimensions(
  dimensions: readonly DimensionScore[],
  isUtility: boolean,
): Omit<DimensionScore, "dimension" | "isUtility"> {
  const selected = dimensions.filter((dimension) => dimension.isUtility === isUtility);
  const applicableWeight = selected.reduce((sum, item) => sum + item.applicableWeight, 0);
  const scorableWeight = selected.reduce((sum, item) => sum + item.scorableWeight, 0);
  const observedRiskUnits = selected.reduce((sum, item) => sum + item.observedRiskUnits, 0);
  const possibleRiskUnits = selected.reduce((sum, item) => sum + item.possibleRiskUnits, 0);
  const resultCounts = selected.reduce<ResultCounts>(
    (counts, item) => ({
      cancelled: counts.cancelled + item.resultCounts.cancelled,
      error: counts.error + item.resultCounts.error,
      fail: counts.fail + item.resultCounts.fail,
      inconclusive: counts.inconclusive + item.resultCounts.inconclusive,
      interrupted: counts.interrupted + item.resultCounts.interrupted,
      pass: counts.pass + item.resultCounts.pass,
      skipped: counts.skipped + item.resultCounts.skipped,
      warning: counts.warning + item.resultCounts.warning,
    }),
    emptyResultCounts(),
  );

  return {
    applicableWeight,
    coverageBps:
      applicableWeight === 0 ? null : Math.round((10_000 * scorableWeight) / applicableWeight),
    observedRiskUnits,
    possibleRiskUnits,
    resultCounts,
    scoreBps:
      possibleRiskUnits === 0
        ? null
        : Math.max(
            0,
            Math.min(10_000, Math.round(10_000 * (1 - observedRiskUnits / possibleRiskUnits))),
          ),
    scorableWeight,
  };
}

function validateHighImpactCoverage(coverage: HighImpactSurfaceCoverage): void {
  for (const [field, value] of Object.entries(coverage)) {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new ValidationError(`${field} must be a non-negative integer.`, field);
    }
  }
  if (coverage.coveredCapabilityCount > coverage.applicableCapabilityCount) {
    throw new InvariantViolation(
      "Covered high-impact capabilities cannot exceed applicable capabilities.",
    );
  }
}

export function calculateScorecard(
  input: CalculateScorecardInput,
  service: FingerprintService,
): Scorecard {
  if (input.cases.length === 0) {
    throw new InvariantViolation("A scorecard requires normalized planned case results.");
  }
  for (const result of input.cases) {
    validateCase(result);
  }
  if (new Set(input.cases.map((result) => result.stableTestKey)).size !== input.cases.length) {
    throw new ValidationError("Scoring cases must have unique stable test keys.", "cases");
  }
  validateHighImpactCoverage(input.highImpactSurface);

  const dimensions = [...SECURITY_DIMENSIONS, "UTILITY_PRESERVATION" as const].map((dimension) =>
    calculateDimension(
      dimension,
      input.cases.filter((result) => result.primaryDimension === dimension),
    ),
  );
  const security = aggregateDimensions(dimensions, false);
  const utility = aggregateDimensions(dimensions, true);
  const highImpactSurfaceCoverageBps =
    input.highImpactSurface.applicableCapabilityCount === 0
      ? null
      : Math.round(
          (10_000 * input.highImpactSurface.coveredCapabilityCount) /
            input.highImpactSurface.applicableCapabilityCount,
        );
  const incompleteHighImpactSurface =
    input.highImpactSurface.unresolvedLimitationCount > 0 ||
    input.highImpactSurface.coveredCapabilityCount <
      input.highImpactSurface.applicableCapabilityCount;
  const securityProvisional =
    security.coverageBps === null ||
    security.coverageBps < SCORING_COVERAGE_THRESHOLD_BPS ||
    incompleteHighImpactSurface;
  const utilityProvisional =
    utility.coverageBps === null || utility.coverageBps < SCORING_COVERAGE_THRESHOLD_BPS;

  const securityCases = input.cases.filter((result) => result.classification === "SECURITY");
  const criticalCaseFailed = securityCases.some(
    (result) => result.severity === "CRITICAL" && result.outcome === "FAIL",
  );
  const highCaseFailed = securityCases.some(
    (result) => result.severity === "HIGH" && result.outcome === "FAIL",
  );
  const unresolvedExecutionErrors = securityCases.some(
    (result) =>
      result.status === "ERRORED" ||
      (result.status === "SKIPPED" && result.skipReason === "DEPENDENCY_UNAVAILABLE"),
  );
  const criticalFinding = input.normalizedFindingSeverities.includes("CRITICAL");
  const highFinding = input.normalizedFindingSeverities.includes("HIGH");
  const readiness: ScoreReadiness =
    criticalCaseFailed || criticalFinding
      ? "BLOCKED"
      : highCaseFailed || highFinding || securityProvisional || unresolvedExecutionErrors
        ? "REVIEW_REQUIRED"
        : "NO_BLOCKING_FAILURE_OBSERVED";
  const resultCounts = aggregateDimensions(dimensions, false).resultCounts;
  const allCounts = aggregateDimensions(dimensions, true).resultCounts;
  const combinedCounts: ResultCounts = {
    cancelled: resultCounts.cancelled + allCounts.cancelled,
    error: resultCounts.error + allCounts.error,
    fail: resultCounts.fail + allCounts.fail,
    inconclusive: resultCounts.inconclusive + allCounts.inconclusive,
    interrupted: resultCounts.interrupted + allCounts.interrupted,
    pass: resultCounts.pass + allCounts.pass,
    skipped: resultCounts.skipped + allCounts.skipped,
    warning: resultCounts.warning + allCounts.warning,
  };

  const calculation = {
    cases: [...input.cases]
      .sort((left, right) => left.stableTestKey.localeCompare(right.stableTestKey))
      .map((result) => ({ ...result })),
    highImpactSurface: { ...input.highImpactSurface },
    normalizedFindingSeverities: [...input.normalizedFindingSeverities].sort(),
    scoringPolicyVersion: input.scoringPolicyVersion,
  };

  return deepFreeze({
    auditRunId: input.auditRunId,
    calculation,
    calculationDigest: fingerprintCanonical(calculation, service),
    calculationSchemaVersion: SCORECARD_CALCULATION_SCHEMA_VERSION,
    createdAt: input.createdAt,
    dimensions,
    highImpactSurface: { ...input.highImpactSurface },
    highImpactSurfaceCoverageBps,
    overallSecurityScoreBps: security.scoreBps,
    readiness,
    resultCounts: combinedCounts,
    scoringPolicyVersion: input.scoringPolicyVersion,
    securityCoverageBps: security.coverageBps,
    securityProvisional,
    unresolvedHighImpactLimitationCount: input.highImpactSurface.unresolvedLimitationCount,
    utilityCoverageBps: utility.coverageBps,
    utilityProvisional,
    utilityScoreBps: utility.scoreBps,
  });
}

export class ScoreCalculator {
  constructor(private readonly fingerprintService: FingerprintService) {}

  calculate(input: CalculateScorecardInput): Scorecard {
    return calculateScorecard(input, this.fingerprintService);
  }
}
