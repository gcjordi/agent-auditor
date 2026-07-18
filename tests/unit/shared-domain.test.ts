import { describe, expect, it } from "vitest";

import {
  canonicalSerialize,
  createEntityIdParser,
  fingerprintCanonical,
  utcTimestamp,
  ValidationError,
  versionIdentifier,
} from "@/shared/domain";

import { testFingerprintService } from "./domain-builders";

describe("shared domain primitives", () => {
  it("validates and normalizes entity IDs", () => {
    const parseWidgetId = createEntityIdParser("Widget");

    expect(parseWidgetId("  widget_01  ")).toBe("widget_01");
    expect(() => parseWidgetId("../../unsafe")).toThrow(ValidationError);
    expect(() => parseWidgetId("")).toThrow("Widget ID");
  });

  it("normalizes timestamps to a canonical UTC representation", () => {
    expect(utcTimestamp("2026-07-18T10:00:00+02:00")).toBe("2026-07-18T08:00:00.000Z");
    expect(() => utcTimestamp("not-an-instant")).toThrow(ValidationError);
  });

  it("accepts bounded version identifiers", () => {
    expect(versionIdentifier(" 1.2.0-rc.1 ")).toBe("1.2.0-rc.1");
    expect(() => versionIdentifier("version with spaces")).toThrow(ValidationError);
  });
});

describe("canonical serialization", () => {
  it("sorts object keys recursively and preserves array order", () => {
    expect(canonicalSerialize({ z: 1, nested: { beta: true, alpha: null }, list: [2, 1] })).toBe(
      '{"list":[2,1],"nested":{"alpha":null,"beta":true},"z":1}',
    );

    expect(canonicalSerialize([1, 2])).not.toBe(canonicalSerialize([2, 1]));
  });

  it("produces identical fingerprints for equivalent object key orders", () => {
    const first = fingerprintCanonical(
      { prompt: "bounded", tool: { description: "Read", name: "read" } },
      testFingerprintService,
    );
    const second = fingerprintCanonical(
      { tool: { name: "read", description: "Read" }, prompt: "bounded" },
      testFingerprintService,
    );

    expect(first).toBe(second);
  });

  it("rejects unsupported values, sparse arrays, accessors, and cycles", () => {
    expect(() => canonicalSerialize({ missing: undefined })).toThrow(ValidationError);
    expect(() => canonicalSerialize(Number.POSITIVE_INFINITY)).toThrow(ValidationError);

    const sparse = new Array<unknown>(2);
    sparse[1] = "present";
    expect(() => canonicalSerialize(sparse)).toThrow("sparse arrays");

    const accessor = Object.defineProperty({}, "value", {
      enumerable: true,
      get: () => "unsafe side effect",
    });
    expect(() => canonicalSerialize(accessor)).toThrow("accessor properties");

    const circular: Record<string, unknown> = {};
    circular["self"] = circular;
    expect(() => canonicalSerialize(circular)).toThrow("circular references");
  });
});
