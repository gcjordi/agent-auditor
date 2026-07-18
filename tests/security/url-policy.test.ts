import { describe, expect, it } from "vitest";

import { isSafeInternalUrl } from "@/shared/infrastructure/security/url-policy";

describe("safe URL policy", () => {
  it.each(["/", "/agents", "/agents/local-agent?revision=1"])("allows internal URL %s", (url) => {
    expect(isSafeInternalUrl(url)).toBe(true);
  });

  it.each([
    "https://example.invalid",
    "//example.invalid/path",
    "javascript:alert(1)",
    "/\u0000unsafe",
  ])("rejects unsafe URL %s", (url) => {
    expect(isSafeInternalUrl(url)).toBe(false);
  });
});
