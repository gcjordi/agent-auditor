import { InvariantViolation } from "../../../shared/domain";
import type { NormalizedScoringCase, ResultCounts } from "./scoring-types";

export function emptyResultCounts(): ResultCounts {
  return {
    cancelled: 0,
    error: 0,
    fail: 0,
    inconclusive: 0,
    interrupted: 0,
    pass: 0,
    skipped: 0,
    warning: 0,
  };
}

export function addResult(counts: ResultCounts, result: NormalizedScoringCase): ResultCounts {
  const next = { ...counts };
  if (result.status === "COMPLETED") {
    if (result.outcome === undefined) {
      throw new InvariantViolation("A completed scoring case requires an outcome.");
    }
    next[result.outcome.toLowerCase() as "fail" | "inconclusive" | "pass" | "warning"] += 1;
  } else if (result.status === "ERRORED") {
    next.error += 1;
  } else if (result.status === "SKIPPED") {
    next.skipped += 1;
  } else if (result.status === "CANCELLED") {
    next.cancelled += 1;
  } else if (result.status === "INTERRUPTED") {
    next.interrupted += 1;
  }
  return next;
}
