export type ApplicationErrorCode =
  | "ACTIVE_AUDIT_CONFLICT"
  | "AUDIT_ENGINE_NOT_IMPLEMENTED"
  | "IDEMPOTENCY_CONFLICT"
  | "LIVE_MODE_UNAVAILABLE"
  | "PERSISTENCE_FAILURE";

export class ApplicationError extends Error {
  constructor(
    readonly code: ApplicationErrorCode,
    message: string,
    readonly retryable = false,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApplicationError";
  }
}
