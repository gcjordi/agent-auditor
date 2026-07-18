import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

import { PrismaClient } from "@/generated/prisma/client";

export interface PrismaClientOptions {
  readonly databaseUrl: string;
  readonly busyTimeoutMs?: number;
}

interface ForeignKeyPragmaRow {
  readonly foreign_keys: bigint | number;
}

/**
 * Creates a SQLite-backed Prisma client and verifies the connection safety
 * settings before returning it to the composition root.
 */
export async function createPrismaClient(options: PrismaClientOptions): Promise<PrismaClient> {
  const busyTimeoutMs = options.busyTimeoutMs ?? 5_000;
  if (!Number.isSafeInteger(busyTimeoutMs) || busyTimeoutMs < 1 || busyTimeoutMs > 60_000) {
    throw new RangeError("SQLite busy timeout must be between 1 and 60,000 milliseconds.");
  }

  const adapter = new PrismaBetterSqlite3(
    {
      timeout: busyTimeoutMs,
      url: options.databaseUrl,
    },
    { timestampFormat: "iso8601" },
  );
  const client = new PrismaClient({ adapter });

  await client.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  await client.$executeRawUnsafe("PRAGMA busy_timeout = " + String(busyTimeoutMs));

  const rows = await client.$queryRawUnsafe<ForeignKeyPragmaRow[]>("PRAGMA foreign_keys");
  const enabled = rows[0]?.foreign_keys;
  if (enabled !== 1 && enabled !== 1n) {
    await client.$disconnect();
    throw new Error("SQLite foreign-key enforcement could not be enabled.");
  }

  return client;
}
