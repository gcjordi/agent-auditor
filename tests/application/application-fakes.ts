import {
  type AgentCatalogUnitOfWork,
  type AgentProfile,
  type AgentProfileId,
  type AgentProfileListQuery,
  type AgentProfilePage,
  type AgentProfileRepository,
  type AgentPurgeSummary,
  type AgentRevision,
  type AgentRevisionId,
  type AgentRevisionRepository,
  type AppendAgentRevisionCommand,
  type PurgeAgentDataCommand,
} from "@/modules/agent-catalog";
import {
  type AcquireAuditLeaseCommand,
  type AuditJobPort,
  type AuditJobReconciliationResult,
  type AuditRun,
  type AuditRunId,
  type AuditRunRepository,
  type FailLeasedAuditJobCommand,
  type PersistedAuditJob,
  type QueueAuditRunCommand,
  type QueueAuditRunResult,
  type RecentAuditRunQuery,
  type ReconcileExpiredAuditJobsCommand,
  type RenewAuditLeaseCommand,
  requestAuditCancellation,
  type RequestAuditCancellationCommand,
  type RequeueInterruptedAuditJobCommand,
  transitionAuditRun,
} from "@/modules/auditing";
import {
  ConflictError,
  createEntityIdParser,
  type Fingerprint,
  NotFoundError,
} from "@/shared/domain";

const auditJobId = createEntityIdParser("AuditJob");

export class InMemoryAgentCatalog
  implements AgentCatalogUnitOfWork, AgentProfileRepository, AgentRevisionRepository
{
  readonly profiles = new Map<AgentProfileId, AgentProfile>();
  readonly revisions = new Map<AgentRevisionId, AgentRevision>();
  activeAudit = false;

  async createProfileWithInitialRevision(
    profile: AgentProfile,
    revision: AgentRevision,
  ): Promise<void> {
    if (this.profiles.has(profile.id)) throw new ConflictError("Duplicate profile.");
    this.profiles.set(profile.id, profile);
    this.revisions.set(revision.id, revision);
  }

  async appendRevision(command: AppendAgentRevisionCommand): Promise<void> {
    const profile = this.profiles.get(command.revision.agentProfileId);
    if (profile === undefined) throw new NotFoundError("Agent not found.");
    if (profile.recordVersion !== command.expectedProfileRecordVersion) {
      throw new ConflictError("Profile changed.");
    }
    this.revisions.set(command.revision.id, command.revision);
    this.profiles.set(profile.id, {
      ...profile,
      recordVersion: profile.recordVersion + 1,
      updatedAt: command.revision.createdAt,
    });
  }

  async findById(id: AgentProfileId): Promise<AgentProfile | null> {
    return this.profiles.get(id) ?? null;
  }

  async findRevisionById(id: AgentRevisionId): Promise<AgentRevision | null> {
    return this.revisions.get(id) ?? null;
  }

  async findLatestByProfileId(profileId: AgentProfileId): Promise<AgentRevision | null> {
    return (
      [...this.revisions.values()]
        .filter((revision) => revision.agentProfileId === profileId)
        .sort((left, right) => right.revisionNumber - left.revisionNumber)[0] ?? null
    );
  }

  async listByProfileId(profileId: AgentProfileId): Promise<readonly AgentRevision[]> {
    return [...this.revisions.values()]
      .filter((revision) => revision.agentProfileId === profileId)
      .sort((left, right) => right.revisionNumber - left.revisionNumber);
  }

  async list(query: AgentProfileListQuery): Promise<AgentProfilePage> {
    const profiles = [...this.profiles.values()]
      .filter((profile) => query.includeArchived === true || profile.archivedAt === undefined)
      .slice(0, query.limit);
    return {
      items: await Promise.all(
        profiles.map(async (profile) => {
          const latest = await this.findLatestByProfileId(profile.id);
          if (latest === null) throw new Error("Fixture profile has no revision.");
          return {
            latestRevisionFingerprint: latest.fingerprint,
            latestRevisionId: latest.id,
            latestRevisionNumber: latest.revisionNumber,
            profile,
          };
        }),
      ),
    };
  }

  async previewPurgeAgentData(profileId: AgentProfileId): Promise<AgentPurgeSummary> {
    return this.summary(profileId);
  }

  async purgeAgentData(command: PurgeAgentDataCommand): Promise<AgentPurgeSummary> {
    if (this.activeAudit) throw new ConflictError("Agent has active audit work.");
    const summary = this.summary(command.profileId);
    const profile = this.profiles.get(command.profileId);
    if (profile === undefined) throw new NotFoundError("Agent not found.");
    if (profile.recordVersion !== command.expectedProfileRecordVersion) {
      throw new ConflictError("Profile changed.");
    }
    for (const revision of this.revisions.values()) {
      if (revision.agentProfileId === command.profileId) this.revisions.delete(revision.id);
    }
    this.profiles.delete(command.profileId);
    return summary;
  }

  private summary(profileId: AgentProfileId): AgentPurgeSummary {
    const profileCount = this.profiles.has(profileId) ? 1 : 0;
    const revisionCount = [...this.revisions.values()].filter(
      (revision) => revision.agentProfileId === profileId,
    ).length;
    return {
      auditRunCount: 0,
      comparisonCount: 0,
      evidenceRecordCount: 0,
      profileCount,
      revisionCount,
    };
  }
}

export class InMemoryAuditStore implements AuditRunRepository, AuditJobPort {
  readonly runs = new Map<AuditRunId, AuditRun>();
  readonly jobs = new Map<string, PersistedAuditJob>();
  readonly requestFingerprints = new Map<string, Fingerprint>();
  lastReconcileCommand?: ReconcileExpiredAuditJobsCommand;

  async createRunWithJob(command: QueueAuditRunCommand): Promise<QueueAuditRunResult> {
    const existing = [...this.runs.values()].find(
      (run) => run.idempotencyKey === command.run.idempotencyKey,
    );
    if (existing !== undefined) {
      if (this.requestFingerprints.get(existing.idempotencyKey) !== command.requestFingerprint) {
        throw new ConflictError("Idempotency key intent changed.");
      }
      const job = [...this.jobs.values()].find((item) => item.auditRunId === existing.id);
      if (job === undefined) throw new Error("Fixture run has no job.");
      return { created: false, job, run: existing };
    }
    const job: PersistedAuditJob = {
      attemptCount: 0,
      auditRunId: command.run.id,
      createdAt: command.run.createdAt,
      id: command.jobId,
      recordVersion: 1,
      stage: "QUEUED",
      status: "QUEUED",
      updatedAt: command.run.updatedAt,
    };
    this.runs.set(command.run.id, command.run);
    this.jobs.set(job.id, job);
    this.requestFingerprints.set(command.run.idempotencyKey, command.requestFingerprint);
    return { created: true, job, run: command.run };
  }

  async findRunById(id: AuditRunId): Promise<AuditRun | null> {
    return this.runs.get(id) ?? null;
  }

  async listRecentRuns(query: RecentAuditRunQuery): Promise<readonly AuditRun[]> {
    return [...this.runs.values()].slice(0, query.limit);
  }

  async requestCancellation(command: RequestAuditCancellationCommand): Promise<AuditRun> {
    const run = this.runs.get(command.auditRunId);
    if (run === undefined) throw new NotFoundError("Audit not found.");
    const requested = requestAuditCancellation(run, command.requestedAt);
    const updated =
      run.status === "QUEUED"
        ? transitionAuditRun(requested, "CANCELLED", command.requestedAt)
        : requested;
    this.runs.set(updated.id, updated);
    return updated;
  }

  async reconcileExpiredLeases(
    command: ReconcileExpiredAuditJobsCommand,
  ): Promise<AuditJobReconciliationResult> {
    this.lastReconcileCommand = command;
    return { cancelledRunIds: [], failedRunIds: [], interruptedRunIds: [] };
  }

  async acquireNextLease(_command: AcquireAuditLeaseCommand): Promise<PersistedAuditJob | null> {
    return null;
  }

  async renewLease(_command: RenewAuditLeaseCommand): Promise<PersistedAuditJob> {
    throw new Error("Not needed by this fake.");
  }

  async failLeasedJob(_command: FailLeasedAuditJobCommand): Promise<AuditRun> {
    throw new Error("Not needed by this fake.");
  }

  async requeueInterruptedJob(
    _command: RequeueInterruptedAuditJobCommand,
  ): Promise<PersistedAuditJob> {
    throw new Error("Not needed by this fake.");
  }
}

export function makeQueuedJob(run: AuditRun): PersistedAuditJob {
  return {
    attemptCount: 0,
    auditRunId: run.id,
    createdAt: run.createdAt,
    id: auditJobId("audit_job_1"),
    recordVersion: 1,
    stage: "QUEUED",
    status: "QUEUED",
    updatedAt: run.updatedAt,
  };
}
