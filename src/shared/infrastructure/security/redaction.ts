const REDACTED = "[REDACTED]";
const MAX_DEPTH = 12;

const secretFieldPattern =
  /(?:api[-_]?key|authorization|bearer|credential|passwd|password|private[-_]?key|secret|token)/iu;
const privateKeyPattern =
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu;
const bearerPattern = /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu;
const openAiKeyPattern = /\bsk-(?:proj-)?[A-Za-z0-9_-]{16,}\b/gu;
const passwordAssignmentPattern = /\b(password|passwd|pwd)\s*[:=]\s*[^\s,;]+/giu;

function redactString(value: string): string {
  return value
    .replace(privateKeyPattern, REDACTED)
    .replace(bearerPattern, REDACTED)
    .replace(openAiKeyPattern, REDACTED)
    .replace(passwordAssignmentPattern, "$1=[REDACTED]");
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === null || prototype === Object.prototype;
}

function redactValue(value: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[DEPTH_LIMIT]";
  if (typeof value === "string") return redactString(value);
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (value instanceof Error) {
    return { message: redactString(value.message), name: value.name };
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    return value.map((item) => redactValue(item, seen, depth + 1));
  }
  if (typeof value === "object" && isPlainRecord(value)) {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const output: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, nestedValue] of Object.entries(value)) {
      output[key] = secretFieldPattern.test(key)
        ? REDACTED
        : redactValue(nestedValue, seen, depth + 1);
    }
    return output;
  }
  return `[UNSUPPORTED:${typeof value}]`;
}

export function redactSensitiveData(value: unknown): unknown {
  return redactValue(value, new WeakSet<object>(), 0);
}

export function redactText(value: string): string {
  return redactString(value);
}
