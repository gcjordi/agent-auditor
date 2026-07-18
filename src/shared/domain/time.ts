import type { Brand } from "./brand";
import { ValidationError } from "./errors";

export type UtcTimestamp = Brand<string, "UtcTimestamp">;

export function utcTimestamp(value: string | Date): UtcTimestamp {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);

  if (!Number.isFinite(date.getTime())) {
    throw new ValidationError("Timestamp must be a valid instant.", "timestamp");
  }

  return date.toISOString() as UtcTimestamp;
}

export function compareTimestamps(left: UtcTimestamp, right: UtcTimestamp): number {
  return left.localeCompare(right);
}

export interface Clock {
  now(): UtcTimestamp;
}
