import { type Clock, type IdGenerator, type UtcTimestamp } from "@/shared/domain";

export class FixedClock implements Clock {
  constructor(private current: UtcTimestamp) {}

  now(): UtcTimestamp {
    return this.current;
  }

  set(value: UtcTimestamp): void {
    this.current = value;
  }
}

export class DeterministicIdGenerator implements IdGenerator {
  private index = 0;

  constructor(private readonly values: readonly string[]) {}

  next(): string {
    const value = this.values[this.index];
    if (value === undefined) throw new Error("Deterministic ID sequence exhausted.");
    this.index += 1;
    return value;
  }
}
