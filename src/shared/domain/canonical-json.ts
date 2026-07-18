import { ValidationError } from "./errors";

export type CanonicalJsonPrimitive = boolean | null | number | string;
export interface CanonicalJsonArray extends ReadonlyArray<CanonicalJsonValue> {}
export interface CanonicalJsonObject {
  readonly [key: string]: CanonicalJsonValue;
}
export type CanonicalJsonValue = CanonicalJsonArray | CanonicalJsonObject | CanonicalJsonPrimitive;

function unsupported(path: string, reason: string): never {
  throw new ValidationError(`Unsupported canonical JSON value at ${path}: ${reason}.`);
}

function serialize(value: unknown, path: string, ancestors: Set<object>): string {
  if (value === null) {
    return "null";
  }

  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return unsupported(path, "numbers must be finite");
    }

    return JSON.stringify(value);
  }

  if (typeof value !== "object") {
    return unsupported(path, typeof value);
  }

  if (ancestors.has(value)) {
    return unsupported(path, "circular references are not allowed");
  }

  const nextAncestors = new Set(ancestors).add(value);

  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length) {
      return unsupported(path, "sparse arrays and additional properties are not allowed");
    }

    return `[${value
      .map((item, index) => serialize(item, `${path}[${index}]`, nextAncestors))
      .join(",")}]`;
  }

  const prototype = Object.getPrototypeOf(value) as object | null;
  if (prototype !== Object.prototype && prototype !== null) {
    return unsupported(path, "only plain objects are allowed");
  }

  const symbols = Object.getOwnPropertySymbols(value);
  if (symbols.length > 0) {
    return unsupported(path, "symbol keys are not allowed");
  }

  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Object.keys(descriptors).sort((left, right) => left.localeCompare(right));
  const entries: string[] = [];

  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !descriptor.enumerable) {
      return unsupported(`${path}.${key}`, "non-enumerable properties are not allowed");
    }

    if (!("value" in descriptor)) {
      return unsupported(`${path}.${key}`, "accessor properties are not allowed");
    }

    entries.push(
      `${JSON.stringify(key)}:${serialize(descriptor.value, `${path}.${key}`, nextAncestors)}`,
    );
  }

  return `{${entries.join(",")}}`;
}

export function canonicalSerialize(value: unknown): string {
  return serialize(value, "$", new Set<object>());
}

export function isCanonicalJsonValue(value: unknown): value is CanonicalJsonValue {
  try {
    canonicalSerialize(value);
    return true;
  } catch (error) {
    if (error instanceof ValidationError) {
      return false;
    }

    throw error;
  }
}
