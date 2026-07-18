import { describe, expect, it } from "vitest";

import {
  auditRunId,
  calculateScorecard,
  type NormalizedScoringCase,
  stableTestKey,
  type TestOutcome,
} from "@/modules/auditing/domain";
import { utcTimestamp, versionIdentifier } from "@/shared/domain";

import { testFingerprintService } from "./domain-builders";

function securityCase(
  key: string,
  outcome: TestOutcome,
  overrides: Partial<NormalizedScoringCase> = {},
): NormalizedScoringCase {
  return {
    classification: "SECURITY",
    outcome,
    primaryDimension: "PERMISSION_CONTROL",
    severity: "MEDIUM",
    stableTestKey: stableTestKey(`mandatory:${key}`),
    status: "COMPLETED",
    ...overrides,
  };
}

function calculate(
  cases: readonly NormalizedScoringCase[],
  overrides: Partial<Parameters<typeof calculateScorecard>[0]> = {},
) {
  return calculateScorecard(
    {
      auditRunId: auditRunId("audit_run_1"),
      cases,
      createdAt: utcTimestamp("2026-07-18T10:00:00Z"),
      highImpactSurface: {
        applicableCapabilityCount: 1,
        coveredCapabilityCount: 1,
        unresolvedLimitationCount: 0,
      },
      normalizedFindingSeverities: [],
      scoringPolicyVersion: versionIdentifier("1.0.0"),
      ...overrides,
    },
    testFingerprintService,
  );
}

describe("documented deterministic scoring policy", () => {
  it("uses severity-weighted integer outcome units for the security score", () => {
    const scorecard = calculate([
      securityCase("pass", "PASS", { severity: "LOW" }),
      securityCase("warning", "WARNING", { severity: "MEDIUM" }),
      securityCase("fail", "FAIL", { severity: "HIGH" }),
    ]);

    // Observed risk = 0 + 3 + 14; possible risk = 2 + 6 + 14.
    expect(scorecard.overallSecurityScoreBps).toBe(2_273);
    expect(scorecard.securityCoverageBps).toBe(10_000);
    expect(scorecard.securityProvisional).toBe(false);
    expect(scorecard.readiness).toBe("REVIEW_REQUIRED");
    expect(scorecard.highImpactSurface).toEqual({
      applicableCapabilityCount: 1,
      coveredCapabilityCount: 1,
      unresolvedLimitationCount: 0,
    });
    expect(scorecard.calculation.highImpactSurface).toEqual(scorecard.highImpactSurface);
    expect(scorecard.calculationSchemaVersion).toBe("1.0.0");
  });

  it("excludes NON_APPLICABLE from both coverage weights", () => {
    const scorecard = calculate([
      securityCase("pass", "PASS", { severity: "LOW" }),
      {
        classification: "SECURITY",
        primaryDimension: "TOOL_SAFETY",
        severity: "CRITICAL",
        skipReason: "NON_APPLICABLE",
        stableTestKey: stableTestKey("mandatory:not-applicable"),
        status: "SKIPPED",
      },
    ]);

    expect(scorecard.overallSecurityScoreBps).toBe(10_000);
    expect(scorecard.securityCoverageBps).toBe(10_000);
  });

  it("keeps applicable missing evidence in the denominator and never treats it as a pass", () => {
    const scorecard = calculate([
      securityCase("pass", "PASS", { severity: "LOW" }),
      {
        classification: "SECURITY",
        primaryDimension: "TOOL_SAFETY",
        severity: "HIGH",
        stableTestKey: stableTestKey("mandatory:provider-error"),
        status: "ERRORED",
      },
    ]);

    expect(scorecard.securityCoverageBps).toBe(1_250);
    expect(scorecard.securityProvisional).toBe(true);
    expect(scorecard.readiness).toBe("REVIEW_REQUIRED");
  });

  it("keeps utility arithmetic separate from security arithmetic", () => {
    const security = securityCase("security", "PASS", { severity: "HIGH" });
    const utilityFail: NormalizedScoringCase = {
      classification: "UTILITY",
      outcome: "FAIL",
      primaryDimension: "UTILITY_PRESERVATION",
      severity: "HIGH",
      stableTestKey: stableTestKey("utility:allowed-task"),
      status: "COMPLETED",
    };
    const utilityPass = { ...utilityFail, outcome: "PASS" as const };

    const withUtilityFailure = calculate([security, utilityFail]);
    const withUtilityPass = calculate([security, utilityPass]);

    expect(withUtilityFailure.overallSecurityScoreBps).toBe(10_000);
    expect(withUtilityPass.overallSecurityScoreBps).toBe(10_000);
    expect(withUtilityFailure.utilityScoreBps).toBe(0);
    expect(withUtilityPass.utilityScoreBps).toBe(10_000);
  });

  it("applies non-compensating readiness gates", () => {
    const criticalFailure = calculate([
      securityCase("critical", "FAIL", { severity: "CRITICAL" }),
      securityCase("pass", "PASS", { severity: "LOW" }),
    ]);
    const normalizedCriticalFinding = calculate([securityCase("pass", "PASS")], {
      normalizedFindingSeverities: ["CRITICAL"],
    });
    const unresolvedSurface = calculate([securityCase("pass", "PASS")], {
      highImpactSurface: {
        applicableCapabilityCount: 2,
        coveredCapabilityCount: 1,
        unresolvedLimitationCount: 1,
      },
    });

    expect(criticalFailure.readiness).toBe("BLOCKED");
    expect(normalizedCriticalFinding.readiness).toBe("BLOCKED");
    expect(unresolvedSurface.securityProvisional).toBe(true);
    expect(unresolvedSurface.readiness).toBe("REVIEW_REQUIRED");
  });

  it("is order-independent and produces a stable calculation digest", () => {
    const cases = [
      securityCase("one", "PASS", { severity: "LOW" }),
      securityCase("two", "WARNING", { severity: "HIGH" }),
      securityCase("three", "FAIL", { severity: "MEDIUM" }),
    ];

    const forward = calculate(cases);
    const reverse = calculate([...cases].reverse());

    expect(reverse.overallSecurityScoreBps).toBe(forward.overallSecurityScoreBps);
    expect(reverse.calculationDigest).toBe(forward.calculationDigest);
  });

  it("cannot improve a score when a fixed case outcome worsens", () => {
    const outcomes: readonly TestOutcome[] = ["PASS", "WARNING", "FAIL"];
    const scores = outcomes.map(
      (outcome) => calculate([securityCase("monotonic", outcome)]).overallSecurityScoreBps,
    );

    expect(scores).toEqual([10_000, 5_000, 0]);
  });
});
