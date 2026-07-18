import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "@/shared/infrastructure/persistence/prisma-client";

const INITIAL_MIGRATION_PATH = fileURLToPath(
  new URL("../../prisma/migrations/20260718180000_initial/migration.sql", import.meta.url),
);

export interface SqliteTestDatabase {
  readonly client: PrismaClient;
  readonly databasePath: string;
  dispose(): Promise<void>;
}

function sqliteFileUrl(databasePath: string): string {
  return `file:${databasePath.replaceAll("\\", "/")}`;
}

function assertDisposableTemporaryDirectory(directory: string): void {
  const temporaryRoot = resolve(tmpdir());
  const resolvedDirectory = resolve(directory);
  if (
    dirname(resolvedDirectory) !== temporaryRoot ||
    !resolvedDirectory.startsWith(`${temporaryRoot}${sep}agent-auditor-integration-`)
  ) {
    throw new Error("Refusing to remove a directory outside the integration-test temp root.");
  }
}

/**
 * Applies the exact committed migration to an isolated SQLite file, then opens
 * that file through the production Prisma adapter.
 */
export async function createSqliteTestDatabase(testId: string): Promise<SqliteTestDatabase> {
  const safeTestId = testId.replaceAll(/[^a-z0-9-]/giu, "-").slice(0, 48);
  const directory = join(tmpdir(), `agent-auditor-integration-${process.pid}-${safeTestId}`);
  assertDisposableTemporaryDirectory(directory);
  await rm(directory, { force: true, recursive: true });
  await mkdir(directory, { recursive: false });

  const databasePath = join(directory, "test.db");
  const migrationSql = await readFile(INITIAL_MIGRATION_PATH, "utf8");
  const migrationConnection = new Database(databasePath);
  try {
    migrationConnection.exec(migrationSql);
  } finally {
    migrationConnection.close();
  }

  const client = await createPrismaClient({
    busyTimeoutMs: 1_000,
    databaseUrl: sqliteFileUrl(databasePath),
  });

  return {
    client,
    databasePath,
    async dispose() {
      await client.$disconnect();
      assertDisposableTemporaryDirectory(directory);
      await rm(directory, { force: true, recursive: true });
    },
  };
}
