import { afterEach, describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";
import { PrismaAgentCatalogRepository } from "@/modules/agent-catalog/infrastructure";

import {
  makePersistedAgentFixture,
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

describe("committed SQLite migration", () => {
  it("creates the expected foundation tables and enforces foreign keys", async () => {
    database = await createSqliteTestDatabase("migration");
    const tables = await database.client.$queryRawUnsafe<readonly { readonly name: string }[]>(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    );

    expect(tables.map(({ name }) => name)).toEqual(
      expect.arrayContaining([
        "AgentProfile",
        "AgentRevision",
        "AuditJob",
        "AuditRun",
        "EvidenceRecord",
        "GuardrailSet",
      ]),
    );

    const foreignKeys =
      await database.client.$queryRawUnsafe<readonly { readonly foreign_keys: bigint | number }[]>(
        "PRAGMA foreign_keys",
      );
    expect(Number(foreignKeys[0]?.foreign_keys)).toBe(1);

    const fixture = makePersistedAgentFixture("migration");
    const repository = new PrismaAgentCatalogRepository(database.client, persistenceFingerprints);
    await repository.createProfileWithInitialRevision(fixture.profile, fixture.revision);

    await expect(
      database.client.agentProfile.delete({ where: { id: fixture.profile.id } }),
    ).rejects.toSatisfy(
      (error: unknown) =>
        error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003",
    );
    expect(await database.client.agentProfile.count()).toBe(1);
  });
});
