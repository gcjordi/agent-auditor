export type DomainErrorCode =
  "CONFLICT" | "INVARIANT_VIOLATION" | "NOT_FOUND" | "NOT_IMPLEMENTED" | "VALIDATION_FAILED";

export abstract class DomainError extends Error {
  abstract readonly code: DomainErrorCode;

  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export class ValidationError extends DomainError {
  readonly code = "VALIDATION_FAILED" as const;

  constructor(
    message: string,
    readonly field?: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
  }
}

export class ConflictError extends DomainError {
  readonly code = "CONFLICT" as const;
}

export class NotFoundError extends DomainError {
  readonly code = "NOT_FOUND" as const;
}

export class InvariantViolation extends DomainError {
  readonly code = "INVARIANT_VIOLATION" as const;
}

export class NotImplementedDomainError extends DomainError {
  readonly code = "NOT_IMPLEMENTED" as const;
}
