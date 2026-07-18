import type { PrismaClient } from "@/generated/prisma/client";
import { Prisma } from "@/generated/prisma/client";
import type {
  AgentCatalogUnitOfWork,
  AgentProfileListQuery,
  AgentProfilePage,
  AgentProfileRepository,
  AgentPurgeSummary,
  AgentRevisionRepository,
  AppendAgentRevisionCommand,
  PurgeAgentDataCommand,
} from "@/modules/agent-catalog/application/ports";
import type {
  AgentProfile,
  AgentProfileId,
  AgentRevision,
  AgentRevisionId,
} from "@/modules/agent-catalog/domain";
import {
  ConflictError,
  fingerprint,
  type FingerprintService,
  InvariantViolation,
  NotFoundError,
  ValidationError,
} from "@/shared/domain";

import {
  mapAgentProfileCreateData,
  mapAgentProfileRecord,
  mapAgentRevisionCreateGraph,
  mapAgentRevisionRecord,
  type PersistedAgentRevisionGraph,
} from "./agent-catalog-mapper";

const TERMINAL_RUN_STATUSES = ["CANCELLED", "COMPLETED", "FAILED"] as const;
const TERMINAL_JOB_STATUS = "TERMINAL";

const revisionGraphInclude = {
  permissionGrants: true,
  tools: true,
} as const;

function persistenceConflict(message: string, cause: unknown): never {
  if (
    cause instanceof Prisma.PrismaClientKnownRequestError &&
    (cause.code === "P2002" || cause.code === "P2003" || cause.code === "P2025")
  ) {
    throw new ConflictError(message, { cause });
  }
  throw cause;
}

async function insertRevisionGraph(
  transaction: Prisma.TransactionClient,
  revision: AgentRevision,
): Promise<void> {
  const graph = mapAgentRevisionCreateGraph(revision);
  await transaction.agentRevision.create({ data: graph.revision });
  if (graph.tools.length > 0) {
    await transaction.toolDefinition.createMany({ data: [...graph.tools] });
  }
  if (graph.permissionGrants.length > 0) {
    await transaction.permissionGrant.createMany({ data: [...graph.permissionGrants] });
  }
}

function assertListQuery(query: AgentProfileListQuery): void {
  if (!Number.isSafeInteger(query.limit) || query.limit < 1 || query.limit > 100) {
    throw new ValidationError("Agent profile page size must be between 1 and 100.", "limit");
  }
}

export class PrismaAgentCatalogRepository
  implements AgentCatalogUnitOfWork, AgentProfileRepository, AgentRevisionRepository
{
  constructor(
    private readonly client: PrismaClient,
    private readonly fingerprintService: FingerprintService,
  ) {}

  async createProfileWithInitialRevision(
    profile: AgentProfile,
    revision: AgentRevision,
  ): Promise<void> {
    if (
      revision.agentProfileId !== profile.id ||
      revision.revisionNumber !== 1 ||
      revision.sourceRevisionId !== undefined
    ) {
      throw new InvariantViolation(
        "An initial revision must be revision 1, owned by the new profile, with no source revision.",
      );
    }

    try {
      await this.client.$transaction(async (transaction) => {
        await transaction.agentProfile.create({
          data: mapAgentProfileCreateData(profile),
        });
        await insertRevisionGraph(transaction, revision);
      });
    } catch (error) {
      persistenceConflict("The agent profile or initial revision already exists.", error);
    }
  }

  async appendRevision(command: AppendAgentRevisionCommand): Promise<void> {
    const { expectedPreviousRevisionNumber, expectedProfileRecordVersion, revision } = command;
    if (
      !Number.isSafeInteger(expectedPreviousRevisionNumber) ||
      expectedPreviousRevisionNumber < 1 ||
      !Number.isSafeInteger(expectedProfileRecordVersion) ||
      expectedProfileRecordVersion < 1 ||
      revision.revisionNumber !== expectedPreviousRevisionNumber + 1
    ) {
      throw new InvariantViolation("The new revision number must follow the expected revision.");
    }

    try {
      await this.client.$transaction(async (transaction) => {
        const profile = await transaction.agentProfile.findUnique({
          select: { archivedAt: true, id: true },
          where: { id: revision.agentProfileId },
        });
        if (profile === null) {
          throw new NotFoundError("Agent profile was not found.");
        }
        if (profile.archivedAt !== null) {
          throw new ConflictError("An archived agent profile cannot receive a new revision.");
        }

        const latest = await transaction.agentRevision.findFirst({
          orderBy: { revisionNumber: "desc" },
          select: { id: true, revisionNumber: true },
          where: { agentProfileId: revision.agentProfileId },
        });
        if (
          latest?.revisionNumber !== expectedPreviousRevisionNumber ||
          revision.sourceRevisionId !== latest.id
        ) {
          throw new ConflictError(
            "The agent definition changed before this revision could be saved.",
          );
        }

        const profileUpdate = await transaction.agentProfile.updateMany({
          data: {
            recordVersion: { increment: 1 },
            updatedAt: new Date(revision.createdAt),
          },
          where: {
            archivedAt: null,
            id: revision.agentProfileId,
            recordVersion: expectedProfileRecordVersion,
          },
        });
        if (profileUpdate.count !== 1) {
          throw new ConflictError("The agent profile changed before this revision could be saved.");
        }

        await insertRevisionGraph(transaction, revision);
      });
    } catch (error) {
      if (error instanceof ConflictError || error instanceof NotFoundError) {
        throw error;
      }
      persistenceConflict(
        "The agent definition changed before this revision could be saved.",
        error,
      );
    }
  }

  async findById(id: AgentProfileId): Promise<AgentProfile | null> {
    const record = await this.client.agentProfile.findUnique({ where: { id } });
    return record === null ? null : mapAgentProfileRecord(record);
  }

  async list(query: AgentProfileListQuery): Promise<AgentProfilePage> {
    assertListQuery(query);
    const records = await this.client.agentProfile.findMany({
      ...(query.cursor === undefined ? {} : { cursor: { id: query.cursor }, skip: 1 }),
      include: {
        revisions: {
          orderBy: { revisionNumber: "desc" },
          select: { fingerprint: true, id: true, revisionNumber: true },
          take: 1,
        },
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      ...(query.includeArchived === true ? {} : { where: { archivedAt: null } }),
    });

    const hasMore = records.length > query.limit;
    const pageRecords = records.slice(0, query.limit);
    const items = pageRecords.map((record) => {
      const latest = record.revisions[0];
      if (latest === undefined) {
        throw new InvariantViolation("Persisted agent profile has no revision.");
      }
      return {
        latestRevisionFingerprint: fingerprint(latest.fingerprint),
        latestRevisionId: latest.id as AgentRevisionId,
        latestRevisionNumber: latest.revisionNumber,
        profile: mapAgentProfileRecord(record),
      };
    });
    const last = pageRecords.at(-1);

    return {
      items,
      ...(hasMore && last !== undefined ? { nextCursor: last.id as AgentProfileId } : {}),
    };
  }

  async findRevisionById(id: AgentRevisionId): Promise<AgentRevision | null> {
    const record = await this.client.agentRevision.findUnique({
      include: revisionGraphInclude,
      where: { id },
    });
    return record === null ? null : mapAgentRevisionRecord(record, this.fingerprintService);
  }

  async findLatestByProfileId(profileId: AgentProfileId): Promise<AgentRevision | null> {
    const record = await this.client.agentRevision.findFirst({
      include: revisionGraphInclude,
      orderBy: { revisionNumber: "desc" },
      where: { agentProfileId: profileId },
    });
    return record === null ? null : mapAgentRevisionRecord(record, this.fingerprintService);
  }

  async listByProfileId(profileId: AgentProfileId): Promise<readonly AgentRevision[]> {
    const records = await this.client.agentRevision.findMany({
      include: revisionGraphInclude,
      orderBy: { revisionNumber: "desc" },
      where: { agentProfileId: profileId },
    });
    return records.map((record) =>
      mapAgentRevisionRecord(record as PersistedAgentRevisionGraph, this.fingerprintService),
    );
  }

  async previewPurgeAgentData(profileId: AgentProfileId): Promise<AgentPurgeSummary> {
    return this.client.$transaction((transaction) =>
      this.collectPurgeSummary(transaction, profileId),
    );
  }

  async purgeAgentData(command: PurgeAgentDataCommand): Promise<AgentPurgeSummary> {
    return this.client.$transaction(async (transaction) => {
      const profile = await transaction.agentProfile.findUnique({
        select: { recordVersion: true },
        where: { id: command.profileId },
      });
      if (profile === null) {
        throw new NotFoundError("Agent profile was not found.");
      }
      if (profile.recordVersion !== command.expectedProfileRecordVersion) {
        throw new ConflictError("The agent profile changed after purge confirmation.");
      }

      const revisionRows = await transaction.agentRevision.findMany({
        select: { id: true, sourceRevisionId: true },
        where: { agentProfileId: command.profileId },
      });
      const revisionIds = revisionRows.map((revision) => revision.id);
      const runRows = await transaction.auditRun.findMany({
        select: { baselineRunId: true, id: true, retryOfRunId: true, status: true },
        where: { agentRevisionId: { in: revisionIds } },
      });
      const runIds = runRows.map((run) => run.id);

      if (
        runRows.some(
          (run) =>
            !TERMINAL_RUN_STATUSES.includes(run.status as (typeof TERMINAL_RUN_STATUSES)[number]),
        )
      ) {
        throw new ConflictError("Agent data cannot be purged while an audit is active.");
      }
      const nonterminalJobs = await transaction.auditJob.count({
        where: { auditRunId: { in: runIds }, status: { not: TERMINAL_JOB_STATUS } },
      });
      if (nonterminalJobs > 0) {
        throw new ConflictError("Agent data cannot be purged while an audit job is active.");
      }

      const summary = await this.collectPurgeSummary(transaction, command.profileId);

      const comparisonRows = await transaction.auditComparison.findMany({
        select: { id: true },
        where: {
          OR: [
            { baselineRunId: { in: runIds } },
            { supplementalRunId: { in: runIds } },
            { verificationRunId: { in: runIds } },
          ],
        },
      });
      const comparisonIds = comparisonRows.map((comparison) => comparison.id);
      await transaction.comparisonCase.deleteMany({
        where: { auditComparisonId: { in: comparisonIds } },
      });
      await transaction.findingMatch.deleteMany({
        where: { auditComparisonId: { in: comparisonIds } },
      });
      await transaction.auditComparison.deleteMany({ where: { id: { in: comparisonIds } } });

      const findingRows = await transaction.finding.findMany({
        select: { id: true },
        where: { auditRunId: { in: runIds } },
      });
      const findingIds = findingRows.map((finding) => finding.id);
      const guardrailSetRows = await transaction.guardrailSet.findMany({
        select: { id: true },
        where: {
          OR: [
            { appliedAgentRevisionId: { in: revisionIds } },
            { sourceAgentRevisionId: { in: revisionIds } },
            { sourceAuditRunId: { in: runIds } },
          ],
        },
      });
      const guardrailSetIds = guardrailSetRows.map((set) => set.id);
      const proposalRows = await transaction.guardrailProposal.findMany({
        select: { id: true },
        where: { guardrailSetId: { in: guardrailSetIds } },
      });
      const proposalIds = proposalRows.map((proposal) => proposal.id);
      await transaction.guardrailFinding.deleteMany({
        where: {
          OR: [{ findingId: { in: findingIds } }, { guardrailProposalId: { in: proposalIds } }],
        },
      });
      await transaction.guardrailProposal.deleteMany({
        where: { id: { in: proposalIds } },
      });
      await transaction.guardrailSet.deleteMany({ where: { id: { in: guardrailSetIds } } });

      await transaction.findingEvidence.deleteMany({
        where: { auditRunId: { in: runIds } },
      });
      await transaction.finding.deleteMany({ where: { id: { in: findingIds } } });
      await transaction.dimensionScore.deleteMany({
        where: { scorecard: { auditRunId: { in: runIds } } },
      });
      await transaction.scorecard.deleteMany({ where: { auditRunId: { in: runIds } } });
      await transaction.evidenceRecord.deleteMany({ where: { auditRunId: { in: runIds } } });
      await transaction.traceEvent.deleteMany({
        where: { testExecution: { auditRunId: { in: runIds } } },
      });
      await transaction.testExecution.deleteMany({ where: { auditRunId: { in: runIds } } });
      await transaction.auditJob.deleteMany({ where: { auditRunId: { in: runIds } } });

      for (const runId of orderSelfReferencingRecordsForDeletion(
        runRows.map((run) => ({
          id: run.id,
          references: [run.baselineRunId, run.retryOfRunId],
        })),
      )) {
        await transaction.auditRun.delete({ where: { id: runId } });
      }

      const planRows = await transaction.auditPlan.findMany({
        select: { id: true },
        where: { agentRevisionId: { in: revisionIds } },
      });
      const planIds = planRows.map((plan) => plan.id);
      await transaction.auditTestCase.deleteMany({ where: { auditPlanId: { in: planIds } } });
      await transaction.riskHypothesis.deleteMany({ where: { auditPlanId: { in: planIds } } });
      await transaction.auditPlan.deleteMany({ where: { id: { in: planIds } } });
      await transaction.permissionGrant.deleteMany({
        where: { agentRevisionId: { in: revisionIds } },
      });
      await transaction.toolDefinition.deleteMany({
        where: { agentRevisionId: { in: revisionIds } },
      });

      for (const revisionId of orderSelfReferencingRecordsForDeletion(
        revisionRows.map((revision) => ({
          id: revision.id,
          references: [revision.sourceRevisionId],
        })),
      )) {
        await transaction.agentRevision.delete({ where: { id: revisionId } });
      }
      await transaction.agentProfile.delete({ where: { id: command.profileId } });

      return summary;
    });
  }

  private async collectPurgeSummary(
    transaction: Prisma.TransactionClient,
    profileId: AgentProfileId,
  ): Promise<AgentPurgeSummary> {
    const profileCount = await transaction.agentProfile.count({ where: { id: profileId } });
    if (profileCount === 0) {
      return {
        auditRunCount: 0,
        comparisonCount: 0,
        evidenceRecordCount: 0,
        profileCount: 0,
        revisionCount: 0,
      };
    }
    const revisionIds = (
      await transaction.agentRevision.findMany({
        select: { id: true },
        where: { agentProfileId: profileId },
      })
    ).map((revision) => revision.id);
    const runIds = (
      await transaction.auditRun.findMany({
        select: { id: true },
        where: { agentRevisionId: { in: revisionIds } },
      })
    ).map((run) => run.id);
    const [evidenceRecordCount, comparisonCount] = await Promise.all([
      transaction.evidenceRecord.count({ where: { auditRunId: { in: runIds } } }),
      transaction.auditComparison.count({
        where: {
          OR: [
            { baselineRunId: { in: runIds } },
            { supplementalRunId: { in: runIds } },
            { verificationRunId: { in: runIds } },
          ],
        },
      }),
    ]);
    return {
      auditRunCount: runIds.length,
      comparisonCount,
      evidenceRecordCount,
      profileCount,
      revisionCount: revisionIds.length,
    };
  }
}

interface SelfReferencingRecord {
  readonly id: string;
  readonly references: readonly (string | null)[];
}

function orderSelfReferencingRecordsForDeletion(
  records: readonly SelfReferencingRecord[],
): readonly string[] {
  const owned = new Set(records.map((record) => record.id));
  const remaining = new Map(records.map((record) => [record.id, record]));
  const result: string[] = [];

  while (remaining.size > 0) {
    const referenced = new Set<string>();
    for (const record of remaining.values()) {
      for (const reference of record.references) {
        if (reference !== null && owned.has(reference) && remaining.has(reference)) {
          referenced.add(reference);
        }
      }
    }
    const leaves = [...remaining.keys()].filter((id) => !referenced.has(id)).sort();
    if (leaves.length === 0) {
      throw new InvariantViolation("Persisted lineage contains a cycle.");
    }
    for (const id of leaves) {
      remaining.delete(id);
      result.push(id);
    }
  }
  return result;
}
