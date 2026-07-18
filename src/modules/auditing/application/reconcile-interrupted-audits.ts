import { type Clock, utcTimestamp } from "@/shared/domain";

import type { AuditJobPort, AuditJobReconciliationResult } from "./ports";

export class ReconcileInterruptedAudits {
  constructor(
    private readonly jobs: AuditJobPort,
    private readonly clock: Clock,
    private readonly retryDelayMs = 30_000,
    private readonly maximumAttempts = 3,
  ) {}

  execute(): Promise<AuditJobReconciliationResult> {
    const now = this.clock.now();
    return this.jobs.reconcileExpiredLeases({
      maximumAttempts: this.maximumAttempts,
      nextAttemptAt: utcTimestamp(new Date(Date.parse(now) + this.retryDelayMs)),
      now,
    });
  }
}
