import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { InvariantViolation } from "@/shared/domain";
import {
  parseCanonicalJsonColumn,
  parseCanonicalJsonColumnWithSchema,
} from "@/shared/infrastructure/persistence/canonical-json-column";
import { createPrismaClient } from "@/shared/infrastructure/persistence/prisma-client";
import { Sha256FingerprintService } from "@/shared/infrastructure/runtime/sha256-fingerprint-service";
import { SystemClock } from "@/shared/infrastructure/runtime/system-clock";
import { UuidGenerator } from "@/shared/infrastructure/runtime/uuid-generator";

afterEach(() => {
  vi.useRealTimers();
});

describe("runtime infrastructure adapters", () => {
  it("projects the system clock as a normalized UTC instant", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T12:34:56.789+02:00"));

    expect(new SystemClock().now()).toBe("2026-07-18T10:34:56.789Z");
  });

  it("generates RFC 4122 version 4 UUIDs", () => {
    const generator = new UuidGenerator();
    const first = generator.next();
    const second = generator.next();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
    expect(second).not.toBe(first);
  });

  it("produces a stable, prefixed SHA-256 fingerprint", () => {
    expect(new Sha256FingerprintService().sha256("hello")).toBe(
      "sha256:2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });
});

describe("canonical JSON persistence boundary", () => {
  it("accepts canonical persisted JSON and validates its schema", () => {
    const text = '{"items":[true,null],"name":"fixture"}';
    const schema = z
      .object({
        items: z.tuple([z.literal(true), z.null()]),
        name: z.literal("fixture"),
      })
      .strict();

    expect(parseCanonicalJsonColumn(text, "fixture column")).toEqual({
      items: [true, null],
      name: "fixture",
    });
    expect(parseCanonicalJsonColumnWithSchema(text, "fixture column", schema)).toEqual({
      items: [true, null],
      name: "fixture",
    });
  });

  it.each([
    ['{"name":"fixture","items":[true,null]}', "non-canonical property order"],
    ['{ "items":[true,null],"name":"fixture"}', "non-canonical whitespace"],
    ['{"items":[true,null],', "malformed JSON"],
  ])("rejects %s as corrupted persisted data (%s)", (text) => {
    expect(() => parseCanonicalJsonColumn(text, "fixture column")).toThrow(InvariantViolation);
  });

  it("normalizes schema failures as persistence integrity errors", () => {
    const schema = z.object({ count: z.number().int().positive() }).strict();

    expect(() =>
      parseCanonicalJsonColumnWithSchema('{"count":0}', "counter column", schema),
    ).toThrow("Persisted counter column failed integrity validation.");
  });
});

describe("Prisma client safety settings", () => {
  it.each([0, 60_001, 1.5, Number.NaN])(
    "rejects an unsafe SQLite busy timeout (%s)",
    async (busyTimeoutMs) => {
      await expect(
        createPrismaClient({ databaseUrl: "file::memory:", busyTimeoutMs }),
      ).rejects.toBeInstanceOf(RangeError);
    },
  );

  it("enables foreign keys and the configured busy timeout before returning", async () => {
    const client = await createPrismaClient({
      busyTimeoutMs: 1_234,
      databaseUrl: "file::memory:",
    });

    try {
      const foreignKeys =
        await client.$queryRawUnsafe<{ readonly foreign_keys: bigint | number }[]>(
          "PRAGMA foreign_keys",
        );
      const busyTimeout =
        await client.$queryRawUnsafe<{ readonly timeout: bigint | number }[]>(
          "PRAGMA busy_timeout",
        );

      expect(Number(foreignKeys[0]?.foreign_keys)).toBe(1);
      expect(Number(busyTimeout[0]?.timeout)).toBe(1_234);
    } finally {
      await client.$disconnect();
    }
  });
});
