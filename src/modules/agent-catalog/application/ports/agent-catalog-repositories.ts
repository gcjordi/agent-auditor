import type { Fingerprint } from "../../../../shared/domain";
import type { AgentProfile, AgentProfileId, AgentRevision, AgentRevisionId } from "../../domain";

export interface AgentProfileListQuery {
  readonly includeArchived?: boolean;
  readonly limit: number;
  readonly cursor?: AgentProfileId;
}

export interface AgentProfileListItem {
  readonly profile: AgentProfile;
  readonly latestRevisionId: AgentRevisionId;
  readonly latestRevisionNumber: number;
  readonly latestRevisionFingerprint: Fingerprint;
}

export interface AgentProfilePage {
  readonly items: readonly AgentProfileListItem[];
  readonly nextCursor?: AgentProfileId;
}

export interface AgentProfileRepository {
  findById(id: AgentProfileId): Promise<AgentProfile | null>;
  list(query: AgentProfileListQuery): Promise<AgentProfilePage>;
}

export interface AgentRevisionRepository {
  findRevisionById(id: AgentRevisionId): Promise<AgentRevision | null>;
  findLatestByProfileId(profileId: AgentProfileId): Promise<AgentRevision | null>;
  listByProfileId(profileId: AgentProfileId): Promise<readonly AgentRevision[]>;
}

export interface AgentPurgeSummary {
  readonly profileCount: number;
  readonly revisionCount: number;
  readonly auditRunCount: number;
  readonly evidenceRecordCount: number;
  readonly comparisonCount: number;
}

export interface PurgeAgentDataCommand {
  readonly profileId: AgentProfileId;
  readonly expectedProfileRecordVersion: number;
}

export interface AppendAgentRevisionCommand {
  readonly revision: AgentRevision;
  readonly expectedPreviousRevisionNumber: number;
  readonly expectedProfileRecordVersion: number;
}

/**
 * Atomic write boundary for immutable revision graphs and explicit privacy
 * purge. Generic repositories deliberately expose no revision delete method.
 */
export interface AgentCatalogUnitOfWork {
  createProfileWithInitialRevision(profile: AgentProfile, revision: AgentRevision): Promise<void>;
  appendRevision(command: AppendAgentRevisionCommand): Promise<void>;
  previewPurgeAgentData(profileId: AgentProfileId): Promise<AgentPurgeSummary>;
  purgeAgentData(command: PurgeAgentDataCommand): Promise<AgentPurgeSummary>;
}
