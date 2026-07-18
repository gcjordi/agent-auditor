import type { Brand } from "./brand";
import { canonicalSerialize } from "./canonical-json";
import { ValidationError } from "./errors";

const SHA_256_PATTERN = /^sha256:[a-f0-9]{64}$/u;

export type ContentDigest = Brand<string, "ContentDigest">;
export type Fingerprint = Brand<string, "Fingerprint">;

function parseSha256<Value extends ContentDigest | Fingerprint>(
  value: string,
  field: string,
): Value {
  if (!SHA_256_PATTERN.test(value)) {
    throw new ValidationError(
      `${field} must be a lowercase SHA-256 digest prefixed with sha256:.`,
      field,
    );
  }

  return value as Value;
}

export function contentDigest(value: string): ContentDigest {
  return parseSha256<ContentDigest>(value, "contentDigest");
}

export function fingerprint(value: string): Fingerprint {
  return parseSha256<Fingerprint>(value, "fingerprint");
}

export interface FingerprintService {
  sha256(canonicalContent: string): Fingerprint;
}

export function fingerprintCanonical(value: unknown, service: FingerprintService): Fingerprint {
  return service.sha256(canonicalSerialize(value));
}
