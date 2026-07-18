import { NotFoundError } from "@/shared/domain";

import { type AuditRun, auditRunId } from "../domain";
import type { AuditRunRepository } from "./ports";

export class ListAuditRuns {
  constructor(private readonly runs: AuditRunRepository) {}

  execute(limit = 20): Promise<readonly AuditRun[]> {
    return this.runs.listRecentRuns({ limit });
  }
}

export class GetAuditRun {
  constructor(private readonly runs: AuditRunRepository) {}

  async execute(id: string): Promise<AuditRun> {
    const run = await this.runs.findRunById(auditRunId(id));
    if (run === null) throw new NotFoundError("Audit run was not found.");
    return run;
  }
}
