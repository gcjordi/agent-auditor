import { canonicalSerialize, ValidationError } from "../../../shared/domain";
import type { SchemaInputRecord, SchemaValidationContext } from "./declarative-schema-types";

const DANGEROUS_PROPERTY_NAMES = new Set(["__proto__", "constructor", "prototype"]);
const PROPERTY_NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_-]{0,63}$/u;
const COMMON_KEYWORDS = new Set(["description", "type"]);

export function isPlainSchemaRecord(value: unknown): value is SchemaInputRecord {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value) as object | null;
  return prototype === Object.prototype || prototype === null;
}

export function assertAllowedSchemaKeys(
  value: Record<string, unknown>,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  for (const key of Object.keys(value)) {
    if (!COMMON_KEYWORDS.has(key) && !allowed.has(key)) {
      throw new ValidationError(`Unsupported schema keyword "${key}" at ${path}.`, path);
    }
  }
}

export function optionalSchemaDescription(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length > 500) {
    throw new ValidationError(
      `Schema description at ${path} must be at most 500 characters.`,
      path,
    );
  }
  return value;
}

export function optionalBoundedInteger(
  value: unknown,
  path: string,
  maximum = 100_000,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    throw new ValidationError(`${path} must be an integer between 0 and ${maximum}.`, path);
  }
  return value as number;
}

export function scalarConstraints<Scalar extends boolean | number | string>(
  value: SchemaInputRecord,
  expectedType: "boolean" | "number" | "string",
  context: SchemaValidationContext,
  path: string,
): { readonly const?: Scalar; readonly enum?: readonly Scalar[] } {
  const output: { const?: Scalar; enum?: readonly Scalar[] } = {};
  if (value.const !== undefined) {
    if (typeof value.const !== expectedType || !isFiniteWhenNumber(value.const)) {
      throw new ValidationError(`Schema const at ${path} must match type ${expectedType}.`, path);
    }
    output.const = value.const as Scalar;
  }
  if (value.enum !== undefined) {
    if (
      !Array.isArray(value.enum) ||
      value.enum.length === 0 ||
      value.enum.length > context.limits.maxEnumValues
    ) {
      throw new ValidationError(
        `Schema enum at ${path} must contain 1 to ${context.limits.maxEnumValues} values.`,
        path,
      );
    }
    const normalized = value.enum.map((entry) => {
      if (typeof entry !== expectedType || !isFiniteWhenNumber(entry)) {
        throw new ValidationError(
          `Every enum value at ${path} must match type ${expectedType}.`,
          path,
        );
      }
      return entry as Scalar;
    });
    if (new Set(normalized.map((entry) => canonicalSerialize(entry))).size !== normalized.length) {
      throw new ValidationError(`Schema enum at ${path} contains duplicate values.`, path);
    }
    output.enum = normalized;
  }
  if (
    output.const !== undefined &&
    output.enum !== undefined &&
    !output.enum.includes(output.const)
  ) {
    throw new ValidationError(`Schema const at ${path} must be included in enum.`, path);
  }
  return output;
}

function isFiniteWhenNumber(value: unknown): boolean {
  return typeof value !== "number" || Number.isFinite(value);
}

export function optionalFiniteNumber(
  value: unknown,
  path: string,
  integer: boolean,
): number | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    (integer && !Number.isSafeInteger(value))
  ) {
    throw new ValidationError(
      `${path} must be ${integer ? "a safe integer" : "a finite number"}.`,
      path,
    );
  }
  return value;
}

export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function isSafeSchemaPropertyName(value: string): boolean {
  return !DANGEROUS_PROPERTY_NAMES.has(value) && PROPERTY_NAME_PATTERN.test(value);
}
