import { type z } from "zod";

import {
  type CanonicalJsonValue,
  canonicalSerialize,
  InvariantViolation,
  isCanonicalJsonValue,
} from "../../domain";

function integrityError(subject: string, cause?: unknown): InvariantViolation {
  return new InvariantViolation(
    `Persisted ${subject} failed integrity validation.`,
    cause === undefined ? undefined : { cause },
  );
}

export function parseCanonicalJsonColumn(text: string, subject: string): CanonicalJsonValue {
  try {
    const parsed: unknown = JSON.parse(text);
    if (!isCanonicalJsonValue(parsed) || canonicalSerialize(parsed) !== text) {
      throw integrityError(subject);
    }
    return parsed;
  } catch (error) {
    if (error instanceof InvariantViolation) {
      throw error;
    }
    throw integrityError(subject, error);
  }
}

export function parseCanonicalJsonColumnWithSchema<Output>(
  text: string,
  subject: string,
  schema: z.ZodType<Output>,
): Output {
  try {
    return schema.parse(parseCanonicalJsonColumn(text, subject));
  } catch (error) {
    if (error instanceof InvariantViolation) {
      throw error;
    }
    throw integrityError(subject, error);
  }
}
