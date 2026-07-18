import { type Clock, utcTimestamp, ValidationError } from "@/shared/domain";

import type { AuditJobPort, PersistedAuditJob } from "./ports";

export interface AuditCoordinatorOptions {
  readonly leaseDurationMs?: number;
  readonly maximumConcurrency?: number;
}

/**
 * Persisted worker boundary for M1/M2. It deliberately terminalizes acquired
 * work with a safe not-implemented code; no score, finding, or evidence is fabricated.
 */
export class AuditCoordinator {
  private readonly leaseDurationMs: number;
  private readonly maximumConcurrency: number;

  constructor(
    private readonly jobs: AuditJobPort,
    private readonly clock: Clock,
    private readonly workerId: string,
    options: AuditCoordinatorOptions = {},
  ) {
    this.leaseDurationMs = options.leaseDurationMs ?? 30_000;
    this.maximumConcurrency = options.maximumConcurrency ?? 1;
    if (
      !Number.isSafeInteger(this.leaseDurationMs) ||
      this.leaseDurationMs < 1_000 ||
      this.leaseDurationMs > 300_000
    ) {
      throw new ValidationError(
        "Audit coordinator lease duration must be between 1,000 and 300,000 milliseconds.",
      );
    }
    if (
      !Number.isSafeInteger(this.maximumConcurrency) ||
      this.maximumConcurrency < 1 ||
      this.maximumConcurrency > 4
    ) {
      throw new ValidationError("Audit coordinator concurrency must be between 1 and 4.");
    }
  }

  async runOneFoundationJob(abortSignal?: AbortSignal): Promise<PersistedAuditJob | null> {
    if (abortSignal?.aborted === true) return null;
    const now = this.clock.now();
    const job = await this.jobs.acquireNextLease({
      leaseExpiresAt: utcTimestamp(new Date(Date.parse(now) + this.leaseDurationMs)),
      now,
      workerId: this.workerId,
    });
    if (job === null) return null;
    await this.jobs.failLeasedJob({
      errorCode: "AUDIT_ENGINE_NOT_IMPLEMENTED",
      errorSummary: "The audit engine is not implemented in the engineering foundation.",
      expectedJobRecordVersion: job.recordVersion,
      failedAt: this.clock.now(),
      jobId: job.id,
      workerId: this.workerId,
    });
    return job;
  }

  /**
   * Drains currently available foundation jobs through a bounded worker pool.
   * An abort signal stops new lease acquisition; any job already leased is
   * terminalized safely before its worker exits.
   */
  async runAvailableFoundationJobs(abortSignal?: AbortSignal): Promise<readonly string[]> {
    const processedJobIds: string[] = [];
    const worker = async (): Promise<void> => {
      while (abortSignal?.aborted !== true) {
        const job = await this.runOneFoundationJob(abortSignal);
        if (job === null) return;
        processedJobIds.push(job.id);
      }
    };

    await Promise.all(Array.from({ length: this.maximumConcurrency }, async () => worker()));
    return Object.freeze([...processedJobIds]);
  }
}
