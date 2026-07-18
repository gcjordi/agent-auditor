import {
  type Clock,
  ConflictError,
  type IdGenerator,
  NotFoundError,
  ValidationError,
} from "@/shared/domain";

import {
  type AgentDefinitionPolicy,
  agentProfileId,
  type AgentRevision,
  normalizeToolName,
} from "../domain";
import {
  type AgentDefinitionDraft,
  toOperationalControlsInput,
  toPermissionGrantInput,
  toToolDefinitionInput,
} from "./agent-definition-command";
import { assertNoApparentSecrets } from "./content-secret-policy";
import type {
  AgentCatalogUnitOfWork,
  AgentProfileRepository,
  AgentRevisionRepository,
} from "./ports";

export interface CreateAgentRevisionCommand {
  readonly agentProfileId: string;
  readonly definition: AgentDefinitionDraft;
}

export class CreateAgentRevision {
  constructor(
    private readonly profiles: AgentProfileRepository,
    private readonly revisions: AgentRevisionRepository,
    private readonly unitOfWork: AgentCatalogUnitOfWork,
    private readonly definitionPolicy: AgentDefinitionPolicy,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateAgentRevisionCommand): Promise<AgentRevision> {
    assertNoApparentSecrets(command.definition);
    const profileId = agentProfileId(command.agentProfileId);
    const [profile, previous] = await Promise.all([
      this.profiles.findById(profileId),
      this.revisions.findLatestByProfileId(profileId),
    ]);
    if (profile === null || previous === null)
      throw new NotFoundError("Agent profile was not found.");
    if (profile.archivedAt !== undefined)
      throw new ConflictError("An archived agent cannot receive a revision.");

    const toolIds = new Map<string, string>();
    const tools = command.definition.tools.map((tool) => {
      const name = normalizeToolName(tool.name);
      if (toolIds.has(name))
        throw new ValidationError("Tool names must be unique after normalization.", "tools");
      const id = this.ids.next();
      toolIds.set(name, id);
      return toToolDefinitionInput(tool, id);
    });
    const permissions = command.definition.permissions.map((permission) => {
      const toolDefinitionId =
        permission.toolName === undefined
          ? undefined
          : toolIds.get(normalizeToolName(permission.toolName));
      if (permission.toolName !== undefined && toolDefinitionId === undefined) {
        throw new ValidationError(
          "Every permission toolName must reference a declared tool.",
          "permissions.toolName",
        );
      }
      return toPermissionGrantInput(permission, this.ids.next(), toolDefinitionId);
    });
    const revision = this.definitionPolicy.createRevision({
      agentProfileId: profile.id,
      contentScanStatus: "CLEAR",
      contentScanVersion: "1.0.0",
      createdAt: this.clock.now(),
      creationSource: "USER",
      definitionSchemaVersion: "1.0.0",
      id: this.ids.next(),
      operationalControls: toOperationalControlsInput(command.definition.operationalControls),
      permissions,
      revisionNumber: previous.revisionNumber + 1,
      safeBehaviorNotes: command.definition.safeBehaviorNotes,
      sourceRevisionId: previous.id,
      systemPrompt: command.definition.systemPrompt,
      tools,
    });
    if (revision.fingerprint === previous.fingerprint) {
      throw new ConflictError("The proposed definition is identical to the latest revision.");
    }
    await this.unitOfWork.appendRevision({
      expectedPreviousRevisionNumber: previous.revisionNumber,
      expectedProfileRecordVersion: profile.recordVersion,
      revision,
    });
    return revision;
  }
}
