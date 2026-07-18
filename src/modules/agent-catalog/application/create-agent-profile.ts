import { type Clock, type IdGenerator, ValidationError } from "@/shared/domain";

import {
  type AgentDefinitionPolicy,
  type AgentProfile,
  type AgentRevision,
  createAgentProfile,
  normalizeToolName,
} from "../domain";
import {
  type AgentDefinitionDraft,
  toOperationalControlsInput,
  toPermissionGrantInput,
  toToolDefinitionInput,
} from "./agent-definition-command";
import { assertNoApparentSecrets } from "./content-secret-policy";
import type { AgentCatalogUnitOfWork } from "./ports";

export interface CreateAgentProfileCommand {
  readonly definition: AgentDefinitionDraft;
  readonly description: string;
  readonly name: string;
}

export interface CreatedAgentProfile {
  readonly profile: AgentProfile;
  readonly revision: AgentRevision;
}

export class CreateAgentProfile {
  constructor(
    private readonly unitOfWork: AgentCatalogUnitOfWork,
    private readonly definitionPolicy: AgentDefinitionPolicy,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}

  async execute(command: CreateAgentProfileCommand): Promise<CreatedAgentProfile> {
    assertNoApparentSecrets(command);
    const createdAt = this.clock.now();
    const profile = createAgentProfile({
      createdAt,
      description: command.description,
      id: this.ids.next(),
      name: command.name,
    });
    const toolIds = new Map<string, string>();
    const tools = command.definition.tools.map((tool) => {
      const name = normalizeToolName(tool.name);
      if (toolIds.has(name)) {
        throw new ValidationError("Tool names must be unique after normalization.", "tools");
      }
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
          "Every tool-scoped permission must reference a declared tool name.",
          "permissions.toolName",
        );
      }
      return toPermissionGrantInput(permission, this.ids.next(), toolDefinitionId);
    });
    const revision = this.definitionPolicy.createRevision({
      agentProfileId: profile.id,
      contentScanStatus: "CLEAR",
      contentScanVersion: "1.0.0",
      createdAt,
      creationSource: "USER",
      definitionSchemaVersion: "1.0.0",
      id: this.ids.next(),
      operationalControls: toOperationalControlsInput(command.definition.operationalControls),
      permissions,
      revisionNumber: 1,
      safeBehaviorNotes: command.definition.safeBehaviorNotes,
      systemPrompt: command.definition.systemPrompt,
      tools,
    });

    await this.unitOfWork.createProfileWithInitialRevision(profile, revision);
    return { profile, revision };
  }
}
