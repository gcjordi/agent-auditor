import type { Brand } from "./brand";
import { ValidationError } from "./errors";

const ENTITY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/u;

export type EntityId<Name extends string> = Brand<string, `${Name}Id`>;

export function createEntityIdParser<Name extends string>(entityName: Name) {
  return (value: string): EntityId<Name> => {
    const normalized = value.trim();

    if (!ENTITY_ID_PATTERN.test(normalized)) {
      throw new ValidationError(
        `${entityName} ID must contain 1 to 128 URL-safe characters.`,
        "id",
      );
    }

    return normalized as EntityId<Name>;
  };
}

export interface IdGenerator {
  next(): string;
}
