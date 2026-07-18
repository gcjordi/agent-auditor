import { afterEach, describe, expect, it } from "vitest";

import { PrismaAgentCatalogRepository } from "@/modules/agent-catalog/infrastructure";
import { ConflictError, InvariantViolation } from "@/shared/domain";

import {
  makePersistedAgentFixture,
  makePersistedRevision,
  persistenceFingerprints,
} from "../fixtures/persistence-domain-builders";
import {
  createSqliteTestDatabase,
  type SqliteTestDatabase,
} from "../fixtures/sqlite-test-database";

let database: SqliteTestDatabase | undefined;

afterEach(async () => {
  await database?.dispose();
  database = undefined;
});

describe("Prisma agent catalog repository", () => {
  it("round-trips an immutable graph and rejects a stale compare-and-swap append", async () => {
    database = await createSqliteTestDatabase("agent-cas");
    const repository = new PrismaAgentCatalogRepository(database.client, persistenceFingerprints);
    const fixture = makePersistedAgentFixture("cas");
    await repository.createProfileWithInitialRevision(fixture.profile, fixture.revision);

    const stored = await repository.findRevisionById(fixture.revision.id);
    expect(stored).toEqual(fixture.revision);
    expect(stored?.tools[0]?.inputSchema).toEqual(fixture.revision.tools[0]?.inputSchema);

    const revisionTwo = makePersistedRevision(fixture.profile, {
      idSuffix: "cas_2",
      revisionNumber: 2,
      sourceRevisionId: fixture.revision.id,
      systemPrompt: "Follow the declared boundary and explain every refusal.",
    });
    await repository.appendRevision({
      expectedPreviousRevisionNumber: 1,
      expectedProfileRecordVersion: 1,
      revision: revisionTwo,
    });

    const staleCompetingRevision = makePersistedRevision(fixture.profile, {
      idSuffix: "cas_competing",
      revisionNumber: 2,
      sourceRevisionId: fixture.revision.id,
      systemPrompt: "This competing update must never be stored.",
    });
    await expect(
      repository.appendRevision({
        expectedPreviousRevisionNumber: 1,
        expectedProfileRecordVersion: 1,
        revision: staleCompetingRevision,
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    const revisions = await repository.listByProfileId(fixture.profile.id);
    expect(revisions.map(({ id }) => id)).toEqual([revisionTwo.id, fixture.revision.id]);
    expect((await repository.findById(fixture.profile.id))?.recordVersion).toBe(2);
    expect(await database.client.agentRevision.count()).toBe(2);
  });

  it("fails closed when persisted JSON is valid but not canonical", async () => {
    database = await createSqliteTestDatabase("canonical-corruption");
    const repository = new PrismaAgentCatalogRepository(database.client, persistenceFingerprints);
    const fixture = makePersistedAgentFixture("corruption");
    await repository.createProfileWithInitialRevision(fixture.profile, fixture.revision);

    const row = await database.client.agentRevision.findUniqueOrThrow({
      select: { operationalControlsJson: true },
      where: { id: fixture.revision.id },
    });
    const nonCanonicalJson = JSON.stringify(JSON.parse(row.operationalControlsJson), null, 2);
    expect(nonCanonicalJson).not.toBe(row.operationalControlsJson);
    await database.client.agentRevision.update({
      data: { operationalControlsJson: nonCanonicalJson },
      where: { id: fixture.revision.id },
    });

    await expect(repository.findRevisionById(fixture.revision.id)).rejects.toBeInstanceOf(
      InvariantViolation,
    );
  });
});
