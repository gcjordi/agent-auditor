import { ValidationError } from "@/shared/domain";

const secretCanaryPatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{16,}/iu,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/u,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/u,
] as const;
const secretFieldPattern = /(?:api[-_]?key|authorization|password|private[-_]?key|secret|token)/iu;

export function assertNoApparentSecrets(value: unknown, field = "definition", depth = 0): void {
  if (depth > 24) {
    throw new ValidationError("The definition exceeds the content inspection depth limit.", field);
  }
  if (typeof value === "string") {
    if (secretCanaryPatterns.some((pattern) => pattern.test(value))) {
      throw new ValidationError(
        "The definition appears to contain secret material. Remove it before saving.",
        field,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertNoApparentSecrets(entry, `${field}.${index}`, depth + 1);
    });
    return;
  }
  if (value === null || typeof value !== "object") return;
  for (const [key, nested] of Object.entries(value)) {
    if (secretFieldPattern.test(key) && nested !== undefined && nested !== "") {
      throw new ValidationError(
        "Executable credentials and secret fields are not accepted in agent definitions.",
        `${field}.${key}`,
      );
    }
    assertNoApparentSecrets(nested, `${field}.${key}`, depth + 1);
  }
}
