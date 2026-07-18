import type { Fingerprint, UtcTimestamp, VersionIdentifier } from "../../../shared/domain";
import type { AuditRunId } from "./ids";
import type { ScoreDimension, Severity, StableTestKey } from "./taxonomy";
import type { SkipReason, TestExecutionStatus, TestOutcome } from "./test-execution";

export type ScoreReadiness = "BLOCKED" | "NO_BLOCKING_FAILURE_OBSERVED" | "REVIEW_REQUIRED";

export interface NormalizedScoringCase {
  readonly stableTestKey: StableTestKey;
  readonly severity: Severity;
  readonly primaryDimension: ScoreDimension;
  readonly classification: "SECURITY" | "UTILITY";
  readonly status: TestExecutionStatus;
  readonly outcome?: TestOutcome;
  readonly skipReason?: SkipReason;
}

export interface ResultCounts {
  readonly cancelled: number;
  readonly error: number;
  readonly fail: number;
  readonly inconclusive: number;
  readonly interrupted: number;
  readonly pass: number;
  readonly skipped: number;
  readonly warning: number;
}

export interface DimensionScore {
  readonly dimension: ScoreDimension;
  readonly isUtility: boolean;
  readonly scoreBps: number | null;
  readonly coverageBps: number | null;
  readonly applicableWeight: number;
  readonly scorableWeight: number;
  readonly observedRiskUnits: number;
  readonly possibleRiskUnits: number;
  readonly resultCounts: ResultCounts;
}

export interface HighImpactSurfaceCoverage {
  readonly applicableCapabilityCount: number;
  readonly coveredCapabilityCount: number;
  readonly unresolvedLimitationCount: number;
}

export interface ScorecardCalculationProjection {
  readonly cases: readonly NormalizedScoringCase[];
  readonly highImpactSurface: HighImpactSurfaceCoverage;
  readonly normalizedFindingSeverities: readonly Severity[];
  readonly scoringPolicyVersion: VersionIdentifier;
}

export interface Scorecard {
  readonly auditRunId: AuditRunId;
  readonly scoringPolicyVersion: VersionIdentifier;
  readonly dimensions: readonly DimensionScore[];
  readonly calculationSchemaVersion: VersionIdentifier;
  readonly calculation: ScorecardCalculationProjection;
  readonly overallSecurityScoreBps: number | null;
  readonly utilityScoreBps: number | null;
  readonly securityCoverageBps: number | null;
  readonly utilityCoverageBps: number | null;
  readonly highImpactSurfaceCoverageBps: number | null;
  readonly highImpactSurface: HighImpactSurfaceCoverage;
  readonly unresolvedHighImpactLimitationCount: number;
  readonly securityProvisional: boolean;
  readonly utilityProvisional: boolean;
  readonly readiness: ScoreReadiness;
  readonly resultCounts: ResultCounts;
  readonly calculationDigest: Fingerprint;
  readonly createdAt: UtcTimestamp;
}

export interface CalculateScorecardInput {
  readonly auditRunId: AuditRunId;
  readonly scoringPolicyVersion: VersionIdentifier;
  readonly cases: readonly NormalizedScoringCase[];
  readonly highImpactSurface: HighImpactSurfaceCoverage;
  readonly normalizedFindingSeverities: readonly Severity[];
  readonly createdAt: UtcTimestamp;
}
