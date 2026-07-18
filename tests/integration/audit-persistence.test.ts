import { afterEach, describe, expect, it } from "vitest";

import { PrismaAgentCatalogRepository } from "@/modules/agent-catalog/infrastructure";
import { PrismaAuditRepository } from "@/modules/auditing/infrastructure";
import { ConflictError, createEntityIdParser, utcTimestamp } from "@/shared/domain";

import {
  makePersistedAgentFixture,
  makePersistedAuditRun,
  persistenceFingerprints,
  requestFingerprint,
} from "../fixtures/persistence-domain-builders";
import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../fixtures/sqlite-test-database";

const auditJobId = createEntityIdParser("AuditJob");
let database: SqliteTestDatabase | undefined;

afterEach(async () => {
  await database?.dispose();
  database = undefined;
});

describe("Prisma audit persistence", () => {
  it("deduplicates requests by intent and rejects idempotency-key reuse", async () => {
    database = await createSqliteTestDatabase("audit-idempotency");
    const agentRepository = new PrismaAgentCatalogRepository(
      database.client,
      persistenceFingerprints,
    );
    const auditRepository = new PrismaAuditRepository(database.client);
    const fixture = makePersistedAgentFixture("audit-idempotency");
    await agentRepository.createProfileWithInitialRevision(fixture.profile, fixture.revision);

    const firstRun = makePersistedAuditRun(fixture.revision, {
      id: "audit_run_idempotent_1",
      idempotencyKey: "same-browser-request",
    });
    const first = await auditRepository.createRunWithJob({
      jobId: auditJobId("audit_job_idempotent_1"),
      requestFingerprint: requestFingerprint(),
      run: firstRun,
    });
    expect(first.created).toBe(true);

    const repeatedRun = makePersistedAuditRun(fixture.revision, {
      id: "audit_run_idempotent_2",
      idempotencyKey: "same-browser-request",
    });
    const repeated = await auditRepository.createRunWithJob({
      jobId: auditJobId("audit_job_idempotent_2"),
      requestFingerprint: requestFingerprint(),
      run: repeatedRun,
    });
    expect(repeated.created).toBe(false);
    expect(repeated.run.id).toBe(firstRun.id);
    expect(await database.client.auditRun.count()).toBe(1);
    expect(await database.client.auditJob.count()).toBe(1);

    await expect(
      auditRepository.createRunWithJob({
        jobId: auditJobId("audit_job_idempotent_3"),
        requestFingerprint: requestFingerprint("changed-intent"),
        run: repeatedRun,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("leases, interrupts, explicitly requeues, and cancels expired work", async () => {
    database = await createSqliteTestDatabase("audit-lifecycle");
    const agentRepository = new PrismaAgentCatalogRepository(
      database.client,
      persistenceFingerprints,
    );
    const auditRepository = new PrismaAuditRepository(database.client);
    const fixture = makePersistedAgentFixture("audit-lifecycle");
    await agentRepository.createProfileWithInitialRevision(fixture.profile, fixture.revision);
    const run = makePersistedAuditRun(fixture.revision, {
      id: "audit_run_lifecycle",
      idempotencyKey: "lifecycle-request",
    });
    const jobId = auditJobId("audit_job_lifecycle");
    await auditRepository.createRunWithJob({
      jobId,
      requestFingerprint: requestFingerprint("lifecycle"),
      run,
    });

    const firstLease = await auditRepository.acquireNextLease({
      leaseExpiresAt: utcTimestamp("2026-07-18T09:02:00.000Z"),
      now: utcTimestamp("2026-07-18T09:01:00.000Z"),
      workerId: "integration-worker",
    });
    expect(firstLease).toMatchObject({ attemptCount: 1, status: "LEASED" });
    expect((await auditRepository.findRunById(run.id))?.status).toBe("PLANNING");

    const interrupted = await auditRepository.reconcileExpiredLeases({
      maximumAttempts: 3,
      nextAttemptAt: utcTimestamp("2026-07-18T09:04:00.000Z"),
      now: utcTimestamp("2026-07-18T09:03:00.000Z"),
    });
    expect(interrupted.interruptedRunIds).toEqual([run.id]);
    expect((await auditRepository.findRunById(run.id))?.status).toBe("INTERRUPTED");

    const waitingJob = await database.client.auditJob.findUniqueOrThrow({ where: { id: jobId } });
    expect(waitingJob.status).toBe("WAITING_RETRY");
    await auditRepository.requeueInterruptedJob({
      expectedJobRecordVersion: waitingJob.recordVersion,
      jobId,
      now: utcTimestamp("2026-07-18T09:04:00.000Z"),
    });

    const secondLease = await auditRepository.acquireNextLease({
      leaseExpiresAt: utcTimestamp("2026-07-18T09:06:00.000Z"),
      now: utcTimestamp("2026-07-18T09:05:00.000Z"),
      workerId: "integration-worker",
    });
    expect(secondLease).toMatchObject({ attemptCount: 2, status: "LEASED" });
    const cancelling = await auditRepository.requestCancellation({
      auditRunId: run.id,
      requestedAt: utcTimestamp("2026-07-18T09:05:30.000Z"),
    });
    expect(cancelling.status).toBe("CANCELLING");

    const cancelled = await auditRepository.reconcileExpiredLeases({
      maximumAttempts: 3,
      nextAttemptAt: utcTimestamp("2026-07-18T09:08:00.000Z"),
      now: utcTimestamp("2026-07-18T09:07:00.000Z"),
    });
    expect(cancelled.cancelledRunIds).toEqual([run.id]);
    expect((await auditRepository.findRunById(run.id))?.status).toBe("CANCELLED");
    expect(await database.client.auditJob.findUnique({ where: { id: jobId } })).toMatchObject({
      leaseExpiresAt: null,
      leaseOwner: null,
      status: "TERMINAL",
    });
  });
});
