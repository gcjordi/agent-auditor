import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPrismaClient } from "@/shared/infrastructure/persistence/prisma-client";

const prismaMocks = vi.hoisted(() => ({
  adapterConstructed: vi.fn(),
  clientConstructed: vi.fn(),
  disconnect: vi.fn<() => Promise<void>>(),
  executeRaw: vi.fn<(statement: string) => Promise<number>>(),
  queryRaw: vi.fn<(statement: string) => Promise<unknown>>(),
}));

vi.mock("@prisma/adapter-better-sqlite3", () => ({
  PrismaBetterSqlite3: class MockPrismaBetterSqlite3 {
    readonly adapterKind = "synthetic-sqlite-adapter";

    constructor(options: unknown, adapterOptions: unknown) {
      prismaMocks.adapterConstructed(options, adapterOptions);
    }
  },
}));

vi.mock("@/generated/prisma/client", () => ({
  PrismaClient: class MockPrismaClient {
    constructor(options: unknown) {
      prismaMocks.clientConstructed(options);
    }

    $disconnect(): Promise<void> {
      return prismaMocks.disconnect();
    }

    $executeRawUnsafe(statement: string): Promise<number> {
      return prismaMocks.executeRaw(statement);
    }

    $queryRawUnsafe(statement: string): Promise<unknown> {
      return prismaMocks.queryRaw(statement);
    }
  },
}));

beforeEach(() => {
  prismaMocks.adapterConstructed.mockReset();
  prismaMocks.clientConstructed.mockReset();
  prismaMocks.disconnect.mockReset().mockResolvedValue();
  prismaMocks.executeRaw.mockReset().mockResolvedValue(0);
  prismaMocks.queryRaw.mockReset();
});

describe("Prisma connection guardrails", () => {
  it("uses safe adapter defaults and accepts bigint pragma results", async () => {
    prismaMocks.queryRaw.mockResolvedValue([{ foreign_keys: 1n }]);

    const client = await createPrismaClient({ databaseUrl: "file:synthetic.db" });

    expect(prismaMocks.adapterConstructed).toHaveBeenCalledWith(
      { timeout: 5_000, url: "file:synthetic.db" },
      { timestampFormat: "iso8601" },
    );
    expect(prismaMocks.clientConstructed).toHaveBeenCalledOnce();
    expect(prismaMocks.executeRaw.mock.calls).toEqual([
      ["PRAGMA foreign_keys = ON"],
      ["PRAGMA busy_timeout = 5000"],
    ]);
    expect(prismaMocks.queryRaw).toHaveBeenCalledWith("PRAGMA foreign_keys");
    expect(prismaMocks.disconnect).not.toHaveBeenCalled();
    await client.$disconnect();
  });

  it("disconnects and fails closed when foreign-key enforcement is unavailable", async () => {
    prismaMocks.queryRaw.mockResolvedValue([{ foreign_keys: 0 }]);

    await expect(
      createPrismaClient({ busyTimeoutMs: 2_000, databaseUrl: "file:synthetic.db" }),
    ).rejects.toThrow("SQLite foreign-key enforcement could not be enabled.");
    expect(prismaMocks.disconnect).toHaveBeenCalledOnce();
  });
});
