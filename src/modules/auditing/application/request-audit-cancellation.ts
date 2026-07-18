import type { Clock } from "@/shared/domain";

import { type AuditRun, auditRunId } from "../domain";
import type { AuditJobPort } from "./ports";

export class RequestAuditCancellation {
  constructor(
    private readonly jobs: AuditJobPort,
    private readonly clock: Clock,
  ) {}

  execute(id: string): Promise<AuditRun> {
    return this.jobs.requestCancellation({
      auditRunId: auditRunId(id),
      requestedAt: this.clock.now(),
    });
  }
}
