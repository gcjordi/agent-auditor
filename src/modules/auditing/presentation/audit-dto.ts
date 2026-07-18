import type { AuditRun } from "@/modules/auditing";

export function toAuditRunDto(run: AuditRun) {
  return {
    agentRevisionFingerprint: run.agentRevisionFingerprint,
    agentRevisionId: run.agentRevisionId,
    attemptNumber: run.attemptNumber,
    completedAt: run.completedAt ?? null,
    completedCaseCount: run.completedCaseCount,
    createdAt: run.createdAt,
    currentPhase: run.currentPhase,
    engineVersion: run.engineVersion,
    evaluationPolicyVersion: run.evaluationPolicyVersion,
    failure: run.failure ?? null,
    fixtureVersion: run.fixtureVersion,
    id: run.id,
    mode: run.mode,
    plannedCaseCount: run.plannedCaseCount,
    recordVersion: run.recordVersion,
    runPurpose: run.runPurpose,
    scoringPolicyVersion: run.scoringPolicyVersion,
    startedAt: run.startedAt ?? null,
    status: run.status,
    taxonomyVersion: run.taxonomyVersion,
    updatedAt: run.updatedAt,
  };
}
