import { describe, expect, it, vi } from "vitest";

import {
  type AcquireAuditLeaseCommand,
  AuditCoordinator,
  type AuditJobPort,
  type AuditJobReconciliationResult,
  type AuditRun,
  type AuditRunId,
  type AuditRunRepository,
  type FailLeasedAuditJobCommand,
  GetAuditRun,
  ListAuditRuns,
  type PersistedAuditJob,
  type QueueAuditRunCommand,
  type QueueAuditRunResult,
  type RecentAuditRunQuery,
  type ReconcileExpiredAuditJobsCommand,
  type RenewAuditLeaseCommand,
  type RequestAuditCancellationCommand,
  type RequeueInterruptedAuditJobCommand,
} from "@/modules/auditing";
import {
  createEntityIdParser,
  NotFoundError,
  utcTimestamp,
  ValidationError,
} from "@/shared/domain";

import { FixedClock } from "../fixtures/deterministic-runtime";
import { makeRun } from "../unit/domain-builders";

const auditJobId = createEntityIdParser("AuditJob");

function makeJob(index: number): PersistedAuditJob {
  const run = makeRun({
    id: `audit_run_${index}`,
    idempotencyKey: `audit-request-${index}`,
  });
  return {
    attemptCount: 0,
    auditRunId: run.id,
    createdAt: run.createdAt,
    id: auditJobId(`audit_job_${index}`),
    recordVersion: index,
    stage: "QUEUED",
    status: "QUEUED",
    updatedAt: run.updatedAt,
  };
}

interface RecordingAuditJobOptions {
  readonly abortOnFirstAcquisition?: AbortController;
  readonly gateAcquisitions?: boolean;
}

class RecordingAuditJobs implements AuditJobPort {
  readonly acquireCommands: AcquireAuditLeaseCommand[] = [];
  readonly failureCommands: FailLeasedAuditJobCommand[] = [];
  maximumConcurrentAcquisitions = 0;

  private activeAcquisitions = 0;
  private readonly acquisitionGate: Promise<void>;
  private readonly allJobs: readonly PersistedAuditJob[];
  private readonly queuedJobs: PersistedAuditJob[];
  private readonly releaseGate: () => void;

  constructor(
    jobs: readonly PersistedAuditJob[],
    private readonly options: RecordingAuditJobOptions = {},
  ) {
    this.allJobs = [...jobs];
    this.queuedJobs = [...jobs];
    let releaseGate = (): void => undefined;
    this.acquisitionGate =
      options.gateAcquisitions === true
        ? new Promise<void>((resolve) => {
            releaseGate = resolve;
          })
        : Promise.resolve();
    this.releaseGate = releaseGate;
  }

  releaseAcquisitions(): void {
    this.releaseGate();
  }

  async acquireNextLease(command: AcquireAuditLeaseCommand): Promise<PersistedAuditJob | null> {
    this.acquireCommands.push(command);
    this.activeAcquisitions += 1;
    this.maximumConcurrentAcquisitions = Math.max(
      this.maximumConcurrentAcquisitions,
      this.activeAcquisitions,
    );
    await this.acquisitionGate;
    const job = this.queuedJobs.shift() ?? null;
    this.activeAcquisitions -= 1;
    if (job !== null && this.acquireCommands.length === 1) {
      this.options.abortOnFirstAcquisition?.abort();
    }
    return job;
  }

  async failLeasedJob(command: FailLeasedAuditJobCommand): Promise<AuditRun> {
    this.failureCommands.push(command);
    const job = this.allJobs.find((candidate) => candidate.id === command.jobId);
    if (job === undefined) throw new Error("Synthetic job was not found.");
    return makeRun({ id: job.auditRunId, idempotencyKey: `result-${job.id}` });
  }

  async reconcileExpiredLeases(
    _command: ReconcileExpiredAuditJobsCommand,
  ): Promise<AuditJobReconciliationResult> {
    return { cancelledRunIds: [], failedRunIds: [], interruptedRunIds: [] };
  }

  async renewLease(_command: RenewAuditLeaseCommand): Promise<PersistedAuditJob> {
    throw new Error("Not exercised by the coordinator foundation.");
  }

  async requestCancellation(_command: RequestAuditCancellationCommand): Promise<AuditRun> {
    throw new Error("Not exercised by the coordinator foundation.");
  }

  async requeueInterruptedJob(
    _command: RequeueInterruptedAuditJobCommand,
  ): Promise<PersistedAuditJob> {
    throw new Error("Not exercised by the coordinator foundation.");
  }
}

class RecordingAuditRunRepository implements AuditRunRepository {
  lastListQuery?: RecentAuditRunQuery;

  constructor(private readonly runs: readonly AuditRun[]) {}

  async createRunWithJob(_command: QueueAuditRunCommand): Promise<QueueAuditRunResult> {
    throw new Error("Not exercised by audit queries.");
  }

  async findRunById(id: AuditRunId): Promise<AuditRun | null> {
    return this.runs.find((run) => run.id === id) ?? null;
  }

  async listRecentRuns(query: RecentAuditRunQuery): Promise<readonly AuditRun[]> {
    this.lastListQuery = query;
    return this.runs.slice(0, query.limit);
  }
}

const foundationTime = utcTimestamp("2026-07-18T10:00:00.000Z");

describe("audit coordinator foundation", () => {
  it.each([
    [{ leaseDurationMs: 999 }, "lease duration below minimum"],
    [{ leaseDurationMs: 300_001 }, "lease duration above maximum"],
    [{ leaseDurationMs: 1_000.5 }, "fractional lease duration"],
    [{ maximumConcurrency: 0 }, "zero concurrency"],
    [{ maximumConcurrency: 5 }, "concurrency above maximum"],
    [{ maximumConcurrency: 1.5 }, "fractional concurrency"],
  ] as const)("rejects invalid options: %s (%s)", (options, _description) => {
    expect(
      () =>
        new AuditCoordinator(
          new RecordingAuditJobs([]),
          new FixedClock(foundationTime),
          "worker-1",
          options,
        ),
    ).toThrow(ValidationError);
  });

  it("leases one job and terminalizes it with a safe foundation error", async () => {
    const job = makeJob(1);
    const jobs = new RecordingAuditJobs([job]);
    const coordinator = new AuditCoordinator(jobs, new FixedClock(foundationTime), "worker-1", {
      leaseDurationMs: 2_000,
    });

    await expect(coordinator.runOneFoundationJob()).resolves.toBe(job);
    expect(jobs.acquireCommands).toEqual([
      {
        leaseExpiresAt: "2026-07-18T10:00:02.000Z",
        now: foundationTime,
        workerId: "worker-1",
      },
    ]);
    expect(jobs.failureCommands).toEqual([
      {
        errorCode: "AUDIT_ENGINE_NOT_IMPLEMENTED",
        errorSummary: "The audit engine is not implemented in the engineering foundation.",
        expectedJobRecordVersion: job.recordVersion,
        failedAt: foundationTime,
        jobId: job.id,
        workerId: "worker-1",
      },
    ]);
  });

  it("does not acquire work when already aborted", async () => {
    const jobs = new RecordingAuditJobs([makeJob(1)]);
    const controller = new AbortController();
    controller.abort();

    await expect(
      new AuditCoordinator(jobs, new FixedClock(foundationTime), "worker-1").runOneFoundationJob(
        controller.signal,
      ),
    ).resolves.toBeNull();
    expect(jobs.acquireCommands).toHaveLength(0);
    expect(jobs.failureCommands).toHaveLength(0);
  });

  it("returns null without fabricating a result when the queue is empty", async () => {
    const jobs = new RecordingAuditJobs([]);

    await expect(
      new AuditCoordinator(jobs, new FixedClock(foundationTime), "worker-1").runOneFoundationJob(),
    ).resolves.toBeNull();
    expect(jobs.acquireCommands).toHaveLength(1);
    expect(jobs.failureCommands).toHaveLength(0);
  });

  it("drains available jobs through the configured bounded worker pool", async () => {
    const jobs = new RecordingAuditJobs(
      [makeJob(1), makeJob(2), makeJob(3), makeJob(4), makeJob(5)],
      { gateAcquisitions: true },
    );
    const coordinator = new AuditCoordinator(jobs, new FixedClock(foundationTime), "worker-pool", {
      maximumConcurrency: 3,
    });

    const processing = coordinator.runAvailableFoundationJobs();
    await vi.waitFor(() => {
      expect(jobs.maximumConcurrentAcquisitions).toBe(3);
    });
    jobs.releaseAcquisitions();
    const processedJobIds = await processing;

    expect([...processedJobIds].sort()).toEqual([
      "audit_job_1",
      "audit_job_2",
      "audit_job_3",
      "audit_job_4",
      "audit_job_5",
    ]);
    expect(Object.isFrozen(processedJobIds)).toBe(true);
    expect(jobs.maximumConcurrentAcquisitions).toBe(3);
    expect(jobs.failureCommands).toHaveLength(5);
  });

  it("terminalizes an acquired job before honoring a new abort", async () => {
    const controller = new AbortController();
    const jobs = new RecordingAuditJobs([makeJob(1), makeJob(2)], {
      abortOnFirstAcquisition: controller,
    });

    await expect(
      new AuditCoordinator(
        jobs,
        new FixedClock(foundationTime),
        "worker-1",
      ).runAvailableFoundationJobs(controller.signal),
    ).resolves.toEqual(["audit_job_1"]);
    expect(jobs.acquireCommands).toHaveLength(1);
    expect(jobs.failureCommands).toHaveLength(1);
  });
});

describe("audit query foundations", () => {
  it("uses the default recent-run limit and forwards an explicit limit", async () => {
    const runs = [makeRun(), makeRun({ id: "audit_run_2", idempotencyKey: "request-2" })];
    const repository = new RecordingAuditRunRepository(runs);
    const list = new ListAuditRuns(repository);

    await expect(list.execute()).resolves.toEqual(runs);
    expect(repository.lastListQuery).toEqual({ limit: 20 });
    await expect(list.execute(1)).resolves.toEqual([runs[0]]);
    expect(repository.lastListQuery).toEqual({ limit: 1 });
  });

  it("returns a requested run and maps absence to the application not-found contract", async () => {
    const run = makeRun();
    const get = new GetAuditRun(new RecordingAuditRunRepository([run]));

    await expect(get.execute(run.id)).resolves.toBe(run);
    await expect(get.execute("audit_run_missing")).rejects.toBeInstanceOf(NotFoundError);
  });
});
