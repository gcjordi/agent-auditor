import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createPinoLogger } from "@/shared/infrastructure/logging/pino-logger";
import { redactSensitiveData } from "@/shared/infrastructure/security/redaction";

function collectingDestination(lines: string[]): Writable {
  return new Writable({
    write(chunk, _encoding, callback) {
      lines.push(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
      callback();
    },
  });
}

const logRecordSchema = z.looseObject({
  context: z.record(z.string(), z.unknown()),
  eventName: z.string(),
  level: z.number().int(),
  time: z.iso.datetime(),
});

describe("structured logging boundary", () => {
  it("redacts sensitive context before serialization", () => {
    const lines: string[] = [];
    const logger = createPinoLogger("debug", collectingDestination(lines));

    logger.log("warn", "audit.fixture.warning", {
      authorization: "Bearer synthetic.header.payload",
      correlationId: "correlation-1",
      note: "password=synthetic-password",
    });

    expect(lines).toHaveLength(1);
    const rawRecord: unknown = JSON.parse(lines[0]!);
    const record = logRecordSchema.parse(rawRecord);
    const serializedContext = JSON.stringify(record.context);
    expect(record.eventName).toBe("audit.fixture.warning");
    expect(record.level).toBe(40);
    expect(record.context["correlationId"]).toBe("correlation-1");
    expect(serializedContext).toContain("[REDACTED]");
    expect(serializedContext).not.toContain("synthetic.header.payload");
    expect(serializedContext).not.toContain("synthetic-password");
  });

  it("honors the configured minimum severity", () => {
    const lines: string[] = [];
    const logger = createPinoLogger("warn", collectingDestination(lines));

    logger.log("debug", "filtered.debug");
    logger.log("info", "filtered.info");
    logger.log("error", "retained.error", { errorCode: "SAFE_CODE" });

    expect(lines).toHaveLength(1);
    const rawRecord: unknown = JSON.parse(lines[0]!);
    expect(logRecordSchema.parse(rawRecord)).toMatchObject({
      context: { errorCode: "SAFE_CODE" },
      eventName: "retained.error",
      level: 50,
    });
  });
});

describe("redaction hardening", () => {
  it("keeps only a redacted name and message for Error objects", () => {
    const error = new Error("authorization: Bearer synthetic-error-token");
    error.stack = "synthetic stack canary";

    const serialized = JSON.stringify(redactSensitiveData(error));

    expect(serialized).toContain('"name":"Error"');
    expect(serialized).toContain("[REDACTED]");
    expect(serialized).not.toContain("synthetic-error-token");
    expect(serialized).not.toContain("synthetic stack canary");
  });

  it("bounds recursion and replaces unsupported object instances", () => {
    let deeplyNested: Record<string, unknown> = { final: "value" };
    for (let index = 0; index < 14; index += 1) {
      deeplyNested = { nested: deeplyNested };
    }

    const result = redactSensitiveData({
      createdAt: new Date("2026-07-18T00:00:00.000Z"),
      deeplyNested,
    });
    const serialized = JSON.stringify(result);

    expect(serialized).toContain("[DEPTH_LIMIT]");
    expect(serialized).toContain("[UNSUPPORTED:object]");
    expect(serialized).not.toContain("2026-07-18T00:00:00.000Z");
  });

  it("handles arrays, repeated references, primitives, and unsupported values safely", () => {
    const circularArray: unknown[] = [];
    circularArray.push(circularArray);
    const sharedValue = { label: "shared" };
    const nullPrototype = Object.assign(Object.create(null) as Record<string, unknown>, {
      safe: true,
    });

    expect(
      redactSensitiveData({
        circularArray,
        nullPrototype,
        primitives: [null, true, 7, "safe"],
        repeated: [sharedValue, sharedValue],
        unsupported: [1n, Symbol("synthetic"), undefined],
      }),
    ).toEqual({
      circularArray: ["[CIRCULAR]"],
      nullPrototype: { safe: true },
      primitives: [null, true, 7, "safe"],
      repeated: [{ label: "shared" }, "[CIRCULAR]"],
      unsupported: ["[UNSUPPORTED:bigint]", "[UNSUPPORTED:symbol]", "[UNSUPPORTED:undefined]"],
    });
  });
});
