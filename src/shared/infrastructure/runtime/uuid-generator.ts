import { randomUUID } from "node:crypto";

import type { IdGenerator } from "@/shared/domain/identifiers";

export class UuidGenerator implements IdGenerator {
  next(): string {
    return randomUUID();
  }
}
