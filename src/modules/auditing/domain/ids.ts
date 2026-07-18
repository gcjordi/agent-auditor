import { createEntityIdParser, type EntityId } from "../../../shared/domain";

export type AuditComparisonId = EntityId<"AuditComparison">;
export type AuditPlanId = EntityId<"AuditPlan">;
export type AuditRunId = EntityId<"AuditRun">;
export type AuditTestCaseId = EntityId<"AuditTestCase">;
export type EvidenceRecordId = EntityId<"EvidenceRecord">;
export type FindingId = EntityId<"Finding">;
export type TestExecutionId = EntityId<"TestExecution">;

export const auditComparisonId = createEntityIdParser("AuditComparison");
export const auditPlanId = createEntityIdParser("AuditPlan");
export const auditRunId = createEntityIdParser("AuditRun");
export const auditTestCaseId = createEntityIdParser("AuditTestCase");
export const evidenceRecordId = createEntityIdParser("EvidenceRecord");
export const findingId = createEntityIdParser("Finding");
export const testExecutionId = createEntityIdParser("TestExecution");
