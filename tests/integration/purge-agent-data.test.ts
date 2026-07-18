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

describe("agent privacy purge transaction", () => {
  it("blocks an active audit without partially deleting the graph", async () => {
    database = await createSqliteTestDatabase("purge-active");
    const agentRepository = new PrismaAgentCatalogRepository(
      database.client,
      persistenceFingerprints,
    );
    const auditRepository = new PrismaAuditRepository(database.client);
    const fixture = makePersistedAgentFixture("purge-active");
    await agentRepository.createProfileWithInitialRevision(fixture.profile, fixture.revision);
    const run = makePersistedAuditRun(fixture.revision, {
      id: "audit_run_purge_active",
      idempotencyKey: "purge-active-request",
    });
    await auditRepository.createRunWithJob({
      jobId: auditJobId("audit_job_purge_active"),
      requestFingerprint: requestFingerprint("purge-active"),
      run,
    });

    await expect(
      agentRepository.purgeAgentData({
        expectedProfileRecordVersion: 1,
        profileId: fixture.profile.id,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(await database.client.agentProfile.count()).toBe(1);
    expect(await database.client.agentRevision.count()).toBe(1);
    expect(await database.client.auditRun.count()).toBe(1);
    expect(await database.client.auditJob.count()).toBe(1);
  });

  it("atomically removes a terminal audit graph and reports its evidence", async () => {
    database = await createSqliteTestDatabase("purge-terminal");
    const agentRepository = new PrismaAgentCatalogRepository(
      database.client,
      persistenceFingerprints,
    );
    const auditRepository = new PrismaAuditRepository(database.client);
    const fixture = makePersistedAgentFixture("purge-terminal");
    await agentRepository.createProfileWithInitialRevision(fixture.profile, fixture.revision);
    const run = makePersistedAuditRun(fixture.revision, {
      id: "audit_run_purge_terminal",
      idempotencyKey: "purge-terminal-request",
    });
    await auditRepository.createRunWithJob({
      jobId: auditJobId("audit_job_purge_terminal"),
      requestFingerprint: requestFingerprint("purge-terminal"),
      run,
    });
    await auditRepository.requestCancellation({
      auditRunId: run.id,
      requestedAt: utcTimestamp("2026-07-18T09:01:00.000Z"),
    });
    await database.client.evidenceRecord.create({
      data: {
        auditRunId: run.id,
        contentDigest: `sha256:${"0".repeat(64)}`,
        createdAt: new Date("2026-07-18T09:01:00.000Z"),
        id: "evidence_purge_terminal",
        kind: "PERMISSION_DECISION",
        redactionApplied: false,
        sanitizedExcerpt: "The queued foundation audit was cancelled before execution.",
        sourceSequenceEnd: null,
        sourceSequenceStart: null,
        testExecutionId: null,
      },
    });

    expect(await agentRepository.previewPurgeAgentData(fixture.profile.id)).toEqual({
      auditRunCount: 1,
      comparisonCount: 0,
      evidenceRecordCount: 1,
      profileCount: 1,
      revisionCount: 1,
    });
    const summary = await agentRepository.purgeAgentData({
      expectedProfileRecordVersion: 1,
      profileId: fixture.profile.id,
    });
    expect(summary.evidenceRecordCount).toBe(1);
    expect(await database.client.agentProfile.count()).toBe(0);
    expect(await database.client.agentRevision.count()).toBe(0);
    expect(await database.client.auditRun.count()).toBe(0);
    expect(await database.client.auditJob.count()).toBe(0);
    expect(await database.client.evidenceRecord.count()).toBe(0);
  });
});
