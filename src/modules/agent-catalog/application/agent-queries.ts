import { NotFoundError } from "@/shared/domain";

import { type AgentProfile, agentProfileId, type AgentRevision, agentRevisionId } from "../domain";
import type { AgentProfilePage, AgentProfileRepository, AgentRevisionRepository } from "./ports";

export class ListAgentProfiles {
  constructor(private readonly profiles: AgentProfileRepository) {}

  execute(limit = 20, cursor?: string): Promise<AgentProfilePage> {
    return this.profiles.list({
      ...(cursor === undefined ? {} : { cursor: agentProfileId(cursor) }),
      limit,
    });
  }
}

export interface AgentProfileDetails {
  readonly profile: AgentProfile;
  readonly revisions: readonly AgentRevision[];
}

export class GetAgentProfile {
  constructor(
    private readonly profiles: AgentProfileRepository,
    private readonly revisions: AgentRevisionRepository,
  ) {}

  async execute(id: string): Promise<AgentProfileDetails> {
    const profileId = agentProfileId(id);
    const [profile, revisions] = await Promise.all([
      this.profiles.findById(profileId),
      this.revisions.listByProfileId(profileId),
    ]);
    if (profile === null) throw new NotFoundError("Agent profile was not found.");
    return { profile, revisions };
  }
}

export class GetAgentRevision {
  constructor(private readonly revisions: AgentRevisionRepository) {}

  async execute(id: string): Promise<AgentRevision> {
    const revision = await this.revisions.findRevisionById(agentRevisionId(id));
    if (revision === null) throw new NotFoundError("Agent revision was not found.");
    return revision;
  }
}
