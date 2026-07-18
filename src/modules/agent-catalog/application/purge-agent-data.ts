import { ConflictError, NotFoundError } from "@/shared/domain";

import { agentProfileId } from "../domain";
import type { AgentCatalogUnitOfWork, AgentProfileRepository, AgentPurgeSummary } from "./ports";

export class PurgeAgentData {
  constructor(
    private readonly profiles: AgentProfileRepository,
    private readonly unitOfWork: AgentCatalogUnitOfWork,
  ) {}

  async execute(profileIdValue: string, confirmation: string): Promise<AgentPurgeSummary> {
    const profileId = agentProfileId(profileIdValue);
    if (confirmation !== profileId) {
      throw new ConflictError("Agent data purge requires an exact profile ID confirmation.");
    }
    const profile = await this.profiles.findById(profileId);
    if (profile === null) throw new NotFoundError("Agent profile was not found.");
    return this.unitOfWork.purgeAgentData({
      expectedProfileRecordVersion: profile.recordVersion,
      profileId,
    });
  }
}
