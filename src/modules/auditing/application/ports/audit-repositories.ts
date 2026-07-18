import type { EntityId, Fingerprint, UtcTimestamp } from "../../../../shared/domain";
import type { AuditRun, AuditRunId } from "../../domain";

export type AuditJobId = EntityId<"AuditJob">;
export type AuditJobStatus = "LEASED" | "QUEUED" | "TERMINAL" | "WAITING_RETRY";

export interface PersistedAuditJob {
  readonly id: AuditJobId;
  readonly auditRunId: AuditRunId;
  readonly status: AuditJobStatus;
  readonly stage: string;
  readonly leaseOwner?: string;
  readonly leaseExpiresAt?: UtcTimestamp;
  readonly nextAttemptAt?: UtcTimestamp;
  readonly attemptCount: number;
  readonly recordVersion: number;
  readonly lastErrorCode?: string;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
}

export interface QueueAuditRunCommand {
  readonly run: AuditRun;
  readonly jobId: AuditJobId;
  readonly requestFingerprint: Fingerprint;
}

export interface QueueAuditRunResult {
  readonly run: AuditRun;
  readonly job: PersistedAuditJob;
  readonly created: boolean;
}

export interface RecentAuditRunQuery {
  readonly limit: number;
  readonly agentRevisionId?: string;
}

export interface AuditRunRepository {
  createRunWithJob(command: QueueAuditRunCommand): Promise<QueueAuditRunResult>;
  findRunById(id: AuditRunId): Promise<AuditRun | null>;
  listRecentRuns(query: RecentAuditRunQuery): Promise<readonly AuditRun[]>;
}

export interface AcquireAuditLeaseCommand {
  readonly workerId: string;
  readonly now: UtcTimestamp;
  readonly leaseExpiresAt: UtcTimestamp;
}

export interface RenewAuditLeaseCommand {
  readonly jobId: AuditJobId;
  readonly workerId: string;
  readonly expectedJobRecordVersion: number;
  readonly now: UtcTimestamp;
  readonly leaseExpiresAt: UtcTimestamp;
}

export interface RequestAuditCancellationCommand {
  readonly auditRunId: AuditRunId;
  readonly requestedAt: UtcTimestamp;
}

export interface FailLeasedAuditJobCommand {
  readonly jobId: AuditJobId;
  readonly workerId: string;
  readonly expectedJobRecordVersion: number;
  readonly failedAt: UtcTimestamp;
  readonly errorCode: string;
  readonly errorSummary: string;
}

export interface ReconcileExpiredAuditJobsCommand {
  readonly now: UtcTimestamp;
  readonly nextAttemptAt: UtcTimestamp;
  readonly maximumAttempts: number;
}

export interface RequeueInterruptedAuditJobCommand {
  readonly jobId: AuditJobId;
  readonly expectedJobRecordVersion: number;
  readonly now: UtcTimestamp;
}

export interface AuditJobReconciliationResult {
  readonly cancelledRunIds: readonly AuditRunId[];
  readonly failedRunIds: readonly AuditRunId[];
  readonly interruptedRunIds: readonly AuditRunId[];
}

export interface AuditJobPort {
  acquireNextLease(command: AcquireAuditLeaseCommand): Promise<PersistedAuditJob | null>;
  renewLease(command: RenewAuditLeaseCommand): Promise<PersistedAuditJob>;
  requestCancellation(command: RequestAuditCancellationCommand): Promise<AuditRun>;
  failLeasedJob(command: FailLeasedAuditJobCommand): Promise<AuditRun>;
  reconcileExpiredLeases(
    command: ReconcileExpiredAuditJobsCommand,
  ): Promise<AuditJobReconciliationResult>;
  requeueInterruptedJob(command: RequeueInterruptedAuditJobCommand): Promise<PersistedAuditJob>;
}
