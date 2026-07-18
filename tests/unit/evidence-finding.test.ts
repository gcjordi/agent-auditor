import { describe, expect, it } from "vitest";

import { capabilityKey } from "@/modules/agent-catalog/domain";
import { createEvidenceRecord, createFinding, createTraceEvent } from "@/modules/auditing/domain";
import {
  contentDigest,
  InvariantViolation,
  utcTimestamp,
  versionIdentifier,
} from "@/shared/domain";

import { testFingerprintService } from "./domain-builders";

describe("evidence and findings", () => {
  it("creates ordered, sanitized evidence references", () => {
    const event = createTraceEvent(
      {
        actor: "POLICY",
        occurredAt: utcTimestamp("2026-07-18T10:00:00Z"),
        payload: { decision: "DENY", reasonCode: "OUT_OF_SCOPE" },
        payloadSchemaVersion: versionIdentifier("1.0.0"),
        type: "PERMISSION_DECISION",
      },
      1,
    );
    const evidence = createEvidenceRecord({
      auditRunId: "audit_run_1",
      contentDigest: contentDigest(testFingerprintService.sha256("sanitized evidence")),
      createdAt: utcTimestamp("2026-07-18T10:00:01Z"),
      id: "evidence_1",
      kind: "PERMISSION_DECISION",
      redactionApplied: true,
      sanitizedExcerpt: "Permission denied because the synthetic record was out of scope.",
      sourceSequenceEnd: 1,
      sourceSequenceStart: 1,
      testExecutionId: "execution_1",
    });

    expect(event.sequence).toBe(1);
    expect(evidence.testExecutionId).toBe("execution_1");
  });

  it("requires execution-backed evidence for findings", () => {
    expect(() =>
      createFinding(
        {
          affectedTestKeys: ["mandatory:permission-boundary"],
          auditRunId: "audit_run_1",
          category: "permission.boundary",
          confidence: "HIGH",
          createdAt: utcTimestamp("2026-07-18T10:01:00Z"),
          description: "The target crossed a declared boundary.",
          evaluationPolicyVersion: versionIdentifier("1.0.0"),
          evidenceReferences: [{ evidenceRecordId: "evidence_1" }],
          failureMechanism: "undeclared capability request",
          id: "finding_1",
          impact: "A synthetic out-of-scope record could be requested.",
          primaryDimension: "PERMISSION_CONTROL",
          recommendation: "Narrow the permission and require confirmation.",
          relevantCapabilityKeys: [capabilityKey("records.read")],
          severity: "HIGH",
          title: "Permission boundary bypass",
        },
        testFingerprintService,
      ),
    ).toThrow(InvariantViolation);
  });

  it("fingerprints normalized mechanism and capabilities rather than generated prose", () => {
    const base = {
      affectedTestKeys: ["mandatory:permission-boundary"],
      auditRunId: "audit_run_1",
      category: "permission.boundary",
      confidence: "HIGH" as const,
      createdAt: utcTimestamp("2026-07-18T10:01:00Z"),
      description: "First wording of the observed weakness.",
      evaluationPolicyVersion: versionIdentifier("1.0.0"),
      evidenceReferences: [{ evidenceRecordId: "evidence_1", testExecutionId: "execution_1" }],
      failureMechanism: "Undeclared Capability Request",
      impact: "A synthetic out-of-scope record could be requested.",
      primaryDimension: "PERMISSION_CONTROL" as const,
      recommendation: "Narrow the permission and require confirmation.",
      relevantCapabilityKeys: [capabilityKey("records.read")],
      severity: "HIGH" as const,
      title: "Permission boundary bypass",
    };
    const first = createFinding({ ...base, id: "finding_1" }, testFingerprintService);
    const second = createFinding(
      {
        ...base,
        description: "Different prose describing the same normalized mechanism.",
        evidenceReferences: [{ evidenceRecordId: "evidence_2", testExecutionId: "execution_2" }],
        id: "finding_2",
        title: "Different title",
      },
      testFingerprintService,
    );

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(first).toMatchObject({
      affectedTestKeysSchemaVersion: "1.0.0",
      capabilityKeysSchemaVersion: "1.0.0",
      evaluationPolicyVersion: "1.0.0",
      failureMechanism: "undeclared capability request",
    });
  });
});
