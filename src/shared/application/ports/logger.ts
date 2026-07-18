export type LogSeverity = "debug" | "error" | "info" | "warn";

export interface SafeLogContext {
  readonly auditRunId?: string;
  readonly correlationId?: string;
  readonly durationMs?: number;
  readonly errorCode?: string;
  readonly testId?: string;
  readonly [key: string]: boolean | number | string | undefined;
}

export interface Logger {
  log(severity: LogSeverity, eventName: string, context?: SafeLogContext): void;
}
