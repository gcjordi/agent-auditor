const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001F\u007F]/u;

export function isSafeInternalUrl(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") || CONTROL_CHARACTER_PATTERN.test(value)) {
    return false;
  }

  try {
    const parsed = new URL(value, "http://agent-auditor.local");
    return parsed.origin === "http://agent-auditor.local" && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}
