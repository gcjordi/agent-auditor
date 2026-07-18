import {
  type CanonicalJsonObject,
  type ContentDigest,
  deepFreeze,
  InvariantViolation,
  type UtcTimestamp,
  ValidationError,
  type VersionIdentifier,
} from "../../../shared/domain";
import {
  type AuditRunId,
  auditRunId,
  type EvidenceRecordId,
  evidenceRecordId,
  type TestExecutionId,
  testExecutionId,
} from "./ids";

export type TraceEventType =
  | "ASSERTION_RESULT"
  | "ERROR"
  | "EVALUATOR_DECISION"
  | "MESSAGE"
  | "MODEL_RESPONSE"
  | "PERMISSION_DECISION"
  | "REDACTION_EVENT"
  | "SIMULATOR_OUTCOME"
  | "TOOL_CALL_ATTEMPT";

export type EvidenceKind =
  | "ASSERTION_RESULT"
  | "EVALUATOR_DECISION"
  | "PERMISSION_DECISION"
  | "REDACTION_EVENT"
  | "SIMULATOR_OUTCOME"
  | "TOOL_CALL_ATTEMPT"
  | "TRANSCRIPT_OBSERVATION";

export type TraceActor =
  "AUDITOR" | "MODEL" | "POLICY" | "SIMULATOR" | "SYSTEM" | "TARGET" | "USER";

export interface TraceEvent {
  readonly sequence: number;
  readonly type: TraceEventType;
  readonly actor: TraceActor;
  readonly payloadSchemaVersion: VersionIdentifier;
  readonly payload: CanonicalJsonObject;
  readonly occurredAt: UtcTimestamp;
}

interface EvidenceRecordCore {
  readonly id: EvidenceRecordId;
  readonly auditRunId: AuditRunId;
  readonly kind: EvidenceKind;
  readonly contentDigest: ContentDigest;
  readonly sanitizedExcerpt: string;
  readonly redactionApplied: boolean;
  readonly createdAt: UtcTimestamp;
}

type EvidenceProvenance =
  | {
      readonly testExecutionId: TestExecutionId;
      readonly sourceSequenceStart: number;
      readonly sourceSequenceEnd: number;
    }
  | {
      readonly testExecutionId?: never;
      readonly sourceSequenceStart?: never;
      readonly sourceSequenceEnd?: never;
    };

export type EvidenceRecord = Readonly<EvidenceRecordCore & EvidenceProvenance>;

type CreateEvidenceProvenance =
  | {
      readonly testExecutionId: string;
      readonly sourceSequenceStart: number;
      readonly sourceSequenceEnd: number;
    }
  | {
      readonly testExecutionId?: never;
      readonly sourceSequenceStart?: never;
      readonly sourceSequenceEnd?: never;
    };

export type CreateEvidenceRecordInput = Omit<
  EvidenceRecordCore,
  "auditRunId" | "id" | "sanitizedExcerpt"
> & {
  readonly id: string;
  readonly auditRunId: string;
  readonly sanitizedExcerpt: string;
} & CreateEvidenceProvenance;

export function createTraceEvent(
  event: Omit<TraceEvent, "sequence">,
  expectedSequence: number,
): TraceEvent {
  if (!Number.isSafeInteger(expectedSequence) || expectedSequence < 1) {
    throw new ValidationError("Trace sequence must be a positive integer.", "sequence");
  }
  return deepFreeze({ ...event, sequence: expectedSequence });
}

export function createEvidenceRecord(input: CreateEvidenceRecordInput): EvidenceRecord {
  const hasExecution = input.testExecutionId !== undefined;
  const hasSequenceRange =
    input.sourceSequenceStart !== undefined && input.sourceSequenceEnd !== undefined;
  if (hasExecution !== hasSequenceRange) {
    throw new InvariantViolation(
      "Evidence execution ID and source sequence range must be provided together.",
    );
  }
  if (
    hasSequenceRange &&
    (!Number.isSafeInteger(input.sourceSequenceStart) ||
      !Number.isSafeInteger(input.sourceSequenceEnd) ||
      input.sourceSequenceStart < 1 ||
      input.sourceSequenceEnd < input.sourceSequenceStart)
  ) {
    throw new InvariantViolation("Evidence source sequence must be a valid ordered range.");
  }
  const sanitizedExcerpt = input.sanitizedExcerpt.trim();
  if (sanitizedExcerpt.length === 0 || sanitizedExcerpt.length > 2_000) {
    throw new ValidationError(
      "A sanitized evidence excerpt must contain 1 to 2,000 characters.",
      "sanitizedExcerpt",
    );
  }

  const record = {
    auditRunId: auditRunId(input.auditRunId),
    contentDigest: input.contentDigest,
    createdAt: input.createdAt,
    id: evidenceRecordId(input.id),
    kind: input.kind,
    redactionApplied: input.redactionApplied,
    sanitizedExcerpt,
  };
  if (!hasExecution || !hasSequenceRange) {
    return deepFreeze(record);
  }
  return deepFreeze({
    ...record,
    sourceSequenceEnd: input.sourceSequenceEnd,
    sourceSequenceStart: input.sourceSequenceStart,
    testExecutionId: testExecutionId(input.testExecutionId),
  });
}
