import type { AuditJob, AuditRun as AuditRunRecord, PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import type {
  AcquireAuditLeaseCommand,
  AuditJobPort,
  AuditJobReconciliationResult,
  AuditRunRepository,
  FailLeasedAuditJobCommand,
  PersistedAuditJob,
  QueueAuditRunCommand,
  QueueAuditRunResult,
  RecentAuditRunQuery,
  ReconcileExpiredAuditJobsCommand,
  RenewAuditLeaseCommand,
  RequestAuditCancellationCommand,
  RequeueInterruptedAuditJobCommand,
} from "@/modules/auditing/application/ports";
import {
  type AuditRun,
  type AuditRunId,
  requestAuditCancellation,
  transitionAuditRun,
} from "@/modules/auditing/domain";
import { ConflictError, InvariantViolation, NotFoundError, ValidationError } from "@/shared/domain";

import {
  mapAuditJobRecord,
  mapAuditRunCreateData,
  mapAuditRunRecord,
} from "./audit-persistence-mapper";

const ACTIVE_RUN_STATUSES = [
  "CANCELLING",
  "EVALUATING",
  "EXECUTING",
  "FINALIZING",
  "PLANNING",
] as const;

function safeWorkerId(value: string): string {
  const normalized = value.trim();
  if (
    normalized.length < 1 ||
    normalized.length > 128 ||
    !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(normalized)
  ) {
    throw new ValidationError("Worker ID must be a bounded local process identifier.", "workerId");
  }
  return normalized;
}

function safeErrorCode(value: string): string {
  const normalized = value.trim();
  if (!/^[A-Z][A-Z0-9_]{0,99}$/u.test(normalized)) {
    throw new ValidationError("Audit job error code is invalid.", "errorCode");
  }
  return normalized;
}

function safeErrorSummary(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 500 || /[\r\n]/u.test(normalized)) {
    throw new ValidationError(
      "Audit job error summary must be a bounded single line.",
      "errorSummary",
    );
  }
  return normalized;
}

function assertLeaseWindow(now: string, leaseExpiresAt: string): void {
  if (leaseExpiresAt <= now) {
    throw new ValidationError("Audit job lease expiry must be after the acquisition time.");
  }
}

export class PrismaAuditRepository implements AuditRunRepository, AuditJobPort {
  constructor(private readonly client: PrismaClient) {}

  async createRunWithJob(command: QueueAuditRunCommand): Promise<QueueAuditRunResult> {
    if (
      command.run.status !== "QUEUED" ||
      command.run.currentPhase !== "QUEUED" ||
      command.run.recordVersion !== 1 ||
      command.run.attemptNumber !== 1
    ) {
      throw new InvariantViolation("Only a new queued audit run can be persisted.");
    }

    try {
      return await this.client.$transaction(async (transaction) => {
        const existing = await transaction.auditRun.findUnique({
          include: { auditJob: true },
          where: { idempotencyKey: command.run.idempotencyKey },
        });
        if (existing !== null) {
          return this.mapIdempotentResult(existing, existing.auditJob, command.requestFingerprint);
        }

        const revision = await transaction.agentRevision.findUnique({
          select: { fingerprint: true },
          where: { id: command.run.agentRevisionId },
        });
        if (revision === null) {
          throw new NotFoundError("Agent revision was not found.");
        }
        if (revision.fingerprint !== command.run.agentRevisionFingerprint) {
          throw new ConflictError("The audit target no longer matches the requested revision.");
        }

        const runRecord = await transaction.auditRun.create({
          data: mapAuditRunCreateData(command.run, command.requestFingerprint),
        });
        const jobRecord = await transaction.auditJob.create({
          data: {
            attemptCount: 0,
            auditRunId: command.run.id,
            createdAt: new Date(command.run.createdAt),
            id: command.jobId,
            lastErrorCode: null,
            leaseExpiresAt: null,
            leaseOwner: null,
            nextAttemptAt: null,
            recordVersion: 1,
            stage: "QUEUED",
            status: "QUEUED",
            updatedAt: new Date(command.run.createdAt),
          },
        });
        return {
          created: true,
          job: mapAuditJobRecord(jobRecord),
          run: mapAuditRunRecord(runRecord),
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const existing = await this.client.auditRun.findUnique({
          include: { auditJob: true },
          where: { idempotencyKey: command.run.idempotencyKey },
        });
        if (existing !== null) {
          return this.mapIdempotentResult(existing, existing.auditJob, command.requestFingerprint);
        }
        throw new ConflictError("The audit run or job already exists.", { cause: error });
      }
      throw error;
    }
  }

  async findRunById(id: AuditRunId): Promise<AuditRun | null> {
    const record = await this.client.auditRun.findUnique({ where: { id } });
    return record === null ? null : mapAuditRunRecord(record);
  }

  async listRecentRuns(query: RecentAuditRunQuery): Promise<readonly AuditRun[]> {
    if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) {
      throw new ValidationError("Recent audit limit must be between 1 and 100.", "limit");
    }
    const records = await this.client.auditRun.findMany({
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: query.limit,
      ...(query.agentRevisionId === undefined
        ? {}
        : { where: { agentRevisionId: query.agentRevisionId } }),
    });
    return records.map(mapAuditRunRecord);
  }

  async acquireNextLease(command: AcquireAuditLeaseCommand): Promise<PersistedAuditJob | null> {
    const workerId = safeWorkerId(command.workerId);
    assertLeaseWindow(command.now, command.leaseExpiresAt);

    return this.client
      .$transaction(async (transaction) => {
        const candidate = await transaction.auditJob.findFirst({
          include: { auditRun: true },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          where: { status: "QUEUED" },
        });
        if (candidate === null) {
          return null;
        }
        if (
          candidate.auditRun.status !== "QUEUED" ||
          candidate.auditRun.cancellationRequestedAt !== null
        ) {
          throw new InvariantViolation("Queued audit job and run lifecycle state diverged.");
        }

        const jobUpdate = await transaction.auditJob.updateMany({
          data: {
            attemptCount: { increment: 1 },
            leaseExpiresAt: new Date(command.leaseExpiresAt),
            leaseOwner: workerId,
            recordVersion: { increment: 1 },
            stage: "PLANNING",
            status: "LEASED",
            updatedAt: new Date(command.now),
          },
          where: {
            id: candidate.id,
            recordVersion: candidate.recordVersion,
            status: "QUEUED",
          },
        });
        const runUpdate = await transaction.auditRun.updateMany({
          data: {
            currentPhase: "ANALYZING_SURFACE",
            recordVersion: { increment: 1 },
            startedAt: candidate.auditRun.startedAt ?? new Date(command.now),
            status: "PLANNING",
            updatedAt: new Date(command.now),
          },
          where: {
            id: candidate.auditRunId,
            recordVersion: candidate.auditRun.recordVersion,
            status: "QUEUED",
          },
        });
        if (jobUpdate.count !== 1 || runUpdate.count !== 1) {
          throw new ConflictError("Audit job was leased by another worker.");
        }
        const leased = await transaction.auditJob.findUniqueOrThrow({
          where: { id: candidate.id },
        });
        return mapAuditJobRecord(leased);
      })
      .catch((error: unknown) => {
        if (error instanceof ConflictError) {
          return null;
        }
        throw error;
      });
  }

  async renewLease(command: RenewAuditLeaseCommand): Promise<PersistedAuditJob> {
    const workerId = safeWorkerId(command.workerId);
    assertLeaseWindow(command.now, command.leaseExpiresAt);
    const update = await this.client.auditJob.updateMany({
      data: {
        leaseExpiresAt: new Date(command.leaseExpiresAt),
        recordVersion: { increment: 1 },
        updatedAt: new Date(command.now),
      },
      where: {
        id: command.jobId,
        leaseExpiresAt: { gt: new Date(command.now) },
        leaseOwner: workerId,
        recordVersion: command.expectedJobRecordVersion,
        status: "LEASED",
      },
    });
    if (update.count !== 1) {
      throw new ConflictError("Audit job lease could not be renewed.");
    }
    return mapAuditJobRecord(
      await this.client.auditJob.findUniqueOrThrow({ where: { id: command.jobId } }),
    );
  }

  async requestCancellation(command: RequestAuditCancellationCommand): Promise<AuditRun> {
    return this.client.$transaction(async (transaction) => {
      const run = await transaction.auditRun.findUnique({
        include: { auditJob: true },
        where: { id: command.auditRunId },
      });
      if (run?.auditJob == null) {
        throw new NotFoundError("Audit run was not found.");
      }
      if (run.status === "CANCELLING" || run.status === "CANCELLED") {
        return mapAuditRunRecord(run);
      }
      const cancelImmediately =
        run.status === "QUEUED" ||
        run.status === "INTERRUPTED" ||
        run.auditJob.status === "WAITING_RETRY";
      let nextRun = requestAuditCancellation(mapAuditRunRecord(run), command.requestedAt);
      if (cancelImmediately && nextRun.status === "CANCELLING") {
        nextRun = transitionAuditRun(nextRun, "CANCELLED", command.requestedAt);
      }
      const updatedRun = await transaction.auditRun.update({
        data: {
          cancellationRequestedAt: new Date(nextRun.cancellationRequestedAt ?? command.requestedAt),
          completedAt: nextRun.completedAt === undefined ? null : new Date(nextRun.completedAt),
          currentPhase: nextRun.currentPhase,
          failureCode: nextRun.failure?.code ?? null,
          failureSummary: nextRun.failure?.summary ?? null,
          recordVersion: nextRun.recordVersion,
          status: nextRun.status,
          updatedAt: new Date(nextRun.updatedAt),
        },
        where: { id: run.id },
      });
      if (cancelImmediately) {
        await transaction.auditJob.update({
          data: {
            lastErrorCode: null,
            leaseExpiresAt: null,
            leaseOwner: null,
            nextAttemptAt: null,
            recordVersion: { increment: 1 },
            stage: "TERMINAL",
            status: "TERMINAL",
            updatedAt: new Date(command.requestedAt),
          },
          where: { id: run.auditJob.id },
        });
      }
      return mapAuditRunRecord(updatedRun);
    });
  }

  async failLeasedJob(command: FailLeasedAuditJobCommand): Promise<AuditRun> {
    const workerId = safeWorkerId(command.workerId);
    const errorCode = safeErrorCode(command.errorCode);
    const errorSummary = safeErrorSummary(command.errorSummary);

    return this.client.$transaction(async (transaction) => {
      const job = await transaction.auditJob.findUnique({
        include: { auditRun: true },
        where: { id: command.jobId },
      });
      if (
        job?.status !== "LEASED" ||
        job.leaseOwner !== workerId ||
        job.recordVersion !== command.expectedJobRecordVersion
      ) {
        throw new ConflictError("Audit job lease is no longer owned by this worker.");
      }
      if (
        !ACTIVE_RUN_STATUSES.includes(job.auditRun.status as (typeof ACTIVE_RUN_STATUSES)[number])
      ) {
        throw new InvariantViolation("Only an active leased audit can fail.");
      }

      const cancelled = job.auditRun.cancellationRequestedAt !== null;
      const runRecord = await transaction.auditRun.update({
        data: {
          completedAt: new Date(command.failedAt),
          currentPhase: cancelled ? "CANCELLED" : "FAILED",
          failureCode: cancelled ? null : errorCode,
          failureSummary: cancelled ? null : errorSummary,
          recordVersion: { increment: 1 },
          status: cancelled ? "CANCELLED" : "FAILED",
          updatedAt: new Date(command.failedAt),
        },
        where: { id: job.auditRunId },
      });
      await transaction.auditJob.update({
        data: {
          lastErrorCode: cancelled ? null : errorCode,
          leaseExpiresAt: null,
          leaseOwner: null,
          nextAttemptAt: null,
          recordVersion: { increment: 1 },
          stage: "TERMINAL",
          status: "TERMINAL",
          updatedAt: new Date(command.failedAt),
        },
        where: { id: job.id },
      });
      return mapAuditRunRecord(runRecord);
    });
  }

  async reconcileExpiredLeases(
    command: ReconcileExpiredAuditJobsCommand,
  ): Promise<AuditJobReconciliationResult> {
    if (
      !Number.isSafeInteger(command.maximumAttempts) ||
      command.maximumAttempts < 1 ||
      command.maximumAttempts > 10 ||
      command.nextAttemptAt < command.now
    ) {
      throw new ValidationError("Audit reconciliation policy is invalid.");
    }

    const candidates = await this.client.auditJob.findMany({
      select: { id: true },
      where: {
        leaseExpiresAt: { lte: new Date(command.now) },
        status: "LEASED",
      },
    });
    const cancelledRunIds: AuditRunId[] = [];
    const failedRunIds: AuditRunId[] = [];
    const interruptedRunIds: AuditRunId[] = [];

    for (const candidate of candidates) {
      const result = await this.reconcileOneExpiredLease(candidate.id, command);
      if (result?.kind === "CANCELLED") {
        cancelledRunIds.push(result.runId);
      } else if (result?.kind === "FAILED") {
        failedRunIds.push(result.runId);
      } else if (result?.kind === "INTERRUPTED") {
        interruptedRunIds.push(result.runId);
      }
    }

    return { cancelledRunIds, failedRunIds, interruptedRunIds };
  }

  async requeueInterruptedJob(
    command: RequeueInterruptedAuditJobCommand,
  ): Promise<PersistedAuditJob> {
    return this.client.$transaction(async (transaction) => {
      const job = await transaction.auditJob.findUnique({
        include: { auditRun: true },
        where: { id: command.jobId },
      });
      if (
        job?.status !== "WAITING_RETRY" ||
        job.recordVersion !== command.expectedJobRecordVersion ||
        job.nextAttemptAt === null ||
        job.nextAttemptAt > new Date(command.now) ||
        job.auditRun.status !== "INTERRUPTED" ||
        job.auditRun.cancellationRequestedAt !== null
      ) {
        throw new ConflictError("Interrupted audit job is not eligible to be re-queued.");
      }

      await transaction.auditRun.update({
        data: {
          attemptNumber: { increment: 1 },
          currentPhase: "QUEUED",
          failureCode: null,
          failureSummary: null,
          recordVersion: { increment: 1 },
          status: "QUEUED",
          updatedAt: new Date(command.now),
        },
        where: { id: job.auditRunId },
      });
      const updatedJob = await transaction.auditJob.update({
        data: {
          lastErrorCode: null,
          nextAttemptAt: null,
          recordVersion: { increment: 1 },
          stage: "QUEUED",
          status: "QUEUED",
          updatedAt: new Date(command.now),
        },
        where: { id: job.id },
      });
      return mapAuditJobRecord(updatedJob);
    });
  }

  private mapIdempotentResult(
    run: AuditRunRecord,
    job: AuditJob | null,
    requestFingerprint: string,
  ): QueueAuditRunResult {
    if (run.requestFingerprint !== requestFingerprint) {
      throw new ConflictError(
        "The idempotency key was already used for a different audit request.",
      );
    }
    if (job === null) {
      throw new InvariantViolation("Persisted audit run is missing its coordinator job.");
    }
    return {
      created: false,
      job: mapAuditJobRecord(job),
      run: mapAuditRunRecord(run),
    };
  }

  private async reconcileOneExpiredLease(
    jobId: string,
    command: ReconcileExpiredAuditJobsCommand,
  ): Promise<{
    readonly kind: "CANCELLED" | "FAILED" | "INTERRUPTED";
    readonly runId: AuditRunId;
  } | null> {
    return this.client.$transaction(async (transaction) => {
      const job = await transaction.auditJob.findUnique({
        include: { auditRun: true },
        where: { id: jobId },
      });
      if (
        job?.status !== "LEASED" ||
        job.leaseExpiresAt === null ||
        job.leaseExpiresAt > new Date(command.now)
      ) {
        return null;
      }

      await transaction.testExecution.updateMany({
        data: {
          completedAt: new Date(command.now),
          errorCode: "LEASE_EXPIRED",
          status: "INTERRUPTED",
          terminalReason: "The local coordinator lease expired.",
        },
        where: { auditRunId: job.auditRunId, status: "RUNNING" },
      });

      const cancellationRequested =
        job.auditRun.cancellationRequestedAt !== null || job.auditRun.status === "CANCELLING";
      const exhausted = job.attemptCount >= command.maximumAttempts;
      const kind = cancellationRequested ? "CANCELLED" : exhausted ? "FAILED" : "INTERRUPTED";
      const terminal = kind !== "INTERRUPTED";
      await transaction.auditRun.update({
        data: {
          completedAt: terminal ? new Date(command.now) : null,
          currentPhase: kind,
          failureCode: kind === "CANCELLED" ? null : "LEASE_EXPIRED",
          failureSummary:
            kind === "CANCELLED"
              ? null
              : exhausted
                ? "The local audit recovery attempt limit was reached."
                : "The local coordinator stopped before the audit stage completed.",
          recordVersion: { increment: 1 },
          status: kind,
          updatedAt: new Date(command.now),
        },
        where: { id: job.auditRunId },
      });
      await transaction.auditJob.update({
        data: {
          lastErrorCode: kind === "CANCELLED" ? null : "LEASE_EXPIRED",
          leaseExpiresAt: null,
          leaseOwner: null,
          nextAttemptAt: terminal ? null : new Date(command.nextAttemptAt),
          recordVersion: { increment: 1 },
          stage: terminal ? "TERMINAL" : "INTERRUPTED",
          status: terminal ? "TERMINAL" : "WAITING_RETRY",
          updatedAt: new Date(command.now),
        },
        where: { id: job.id },
      });
      return { kind, runId: job.auditRun.id as AuditRunId };
    });
  }
}
