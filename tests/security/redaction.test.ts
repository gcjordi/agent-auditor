import { describe, expect, it } from "vitest";

import { redactSensitiveData, redactText } from "@/shared/infrastructure/security/redaction";

describe("secret redaction", () => {
  it("removes API keys, bearer tokens, passwords, and private keys", () => {
    const canaries = {
      apiKey: "sk-proj-abcdefghijklmnopqrstuv",
      authorization: "Bearer header.payload.signature",
      nested: {
        note: "password=hunter2",
        privateMaterial:
          "-----BEGIN PRIVATE KEY-----\ncanary-private-material\n-----END PRIVATE KEY-----",
      },
    };

    const serialized = JSON.stringify(redactSensitiveData(canaries));

    expect(serialized).not.toContain("abcdefghijklmnopqrstuv");
    expect(serialized).not.toContain("header.payload.signature");
    expect(serialized).not.toContain("hunter2");
    expect(serialized).not.toContain("canary-private-material");
    expect(serialized).toContain("[REDACTED]");
  });

  it("redacts canaries embedded in otherwise safe text", () => {
    const redacted = redactText("token sk-1234567890abcdefghijkl and password:very-secret");
    expect(redacted).not.toContain("1234567890abcdefghijkl");
    expect(redacted).not.toContain("very-secret");
  });

  it("handles circular structures without throwing", () => {
    const value: { self?: unknown } = {};
    value.self = value;
    expect(redactSensitiveData(value)).toEqual({ self: "[CIRCULAR]" });
  });
});
