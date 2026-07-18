import "server-only";

import pino, { type DestinationStream, type Logger as PinoInstance } from "pino";

import type { Logger, LogSeverity, SafeLogContext } from "@/shared/application/ports/logger";
import { redactSensitiveData } from "@/shared/infrastructure/security/redaction";

export class PinoLogger implements Logger {
  constructor(private readonly delegate: PinoInstance) {}

  log(severity: LogSeverity, eventName: string, context: SafeLogContext = {}): void {
    const safeContext = redactSensitiveData(context);
    this.delegate[severity]({ context: safeContext, eventName });
  }
}

export function createPinoLogger(level: LogSeverity, destination?: DestinationStream): PinoLogger {
  const options = {
    base: null,
    level,
    messageKey: "message",
    timestamp: pino.stdTimeFunctions.isoTime,
  } as const;
  const delegate = destination === undefined ? pino(options) : pino(options, destination);
  return new PinoLogger(delegate);
}
