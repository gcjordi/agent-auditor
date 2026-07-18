import type { Brand } from "./brand";
import { ValidationError } from "./errors";

const VERSION_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,62}[A-Za-z0-9])?$/u;

export type VersionIdentifier = Brand<string, "VersionIdentifier">;

export function versionIdentifier(value: string): VersionIdentifier {
  const normalized = value.trim();

  if (!VERSION_PATTERN.test(normalized)) {
    throw new ValidationError(
      "Version identifier must contain 1 to 64 letters, numbers, dots, underscores, or hyphens.",
      "version",
    );
  }

  return normalized as VersionIdentifier;
}
