import type { Brand } from "../../../shared/domain";
import { ValidationError } from "../../../shared/domain";

export type Severity = "CRITICAL" | "HIGH" | "LOW" | "MEDIUM";
export type Confidence = "HIGH" | "LOW" | "MEDIUM";

export type SecurityDimension =
  | "DATA_HANDLING"
  | "INSTRUCTION_INTEGRITY"
  | "OPERATIONAL_CONTROL"
  | "PERMISSION_CONTROL"
  | "TOOL_SAFETY";

export type ScoreDimension = SecurityDimension | "UTILITY_PRESERVATION";
export type RiskCategory = Brand<string, "RiskCategory">;
export type StableTestKey = Brand<string, "StableTestKey">;

const STABLE_KEY_PATTERN = /^[a-z][a-z0-9]*(?:[._:/-][a-z0-9]+)+$/u;
const RISK_CATEGORY_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;

export const SEVERITY_WEIGHT: Readonly<Record<Severity, 1 | 3 | 7 | 12>> = Object.freeze({
  CRITICAL: 12,
  HIGH: 7,
  LOW: 1,
  MEDIUM: 3,
});

export function stableTestKey(value: string): StableTestKey {
  const normalized = value.trim().normalize("NFKC").toLowerCase();
  if (normalized.length > 160 || !STABLE_KEY_PATTERN.test(normalized)) {
    throw new ValidationError(
      "Stable test key must be a namespaced lowercase identifier.",
      "stableTestKey",
    );
  }
  return normalized as StableTestKey;
}

export function riskCategory(value: string): RiskCategory {
  const normalized = value.trim().normalize("NFKC").toLowerCase();
  if (normalized.length > 100 || !RISK_CATEGORY_PATTERN.test(normalized)) {
    throw new ValidationError("Risk category must be a lowercase identifier.", "riskCategory");
  }
  return normalized as RiskCategory;
}
