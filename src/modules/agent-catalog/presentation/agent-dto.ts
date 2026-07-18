import type { AgentProfile, AgentProfileListItem, AgentRevision } from "@/modules/agent-catalog";

export function toAgentProfileDto(profile: AgentProfile) {
  return {
    archivedAt: profile.archivedAt ?? null,
    createdAt: profile.createdAt,
    description: profile.description,
    id: profile.id,
    name: profile.name,
    recordVersion: profile.recordVersion,
    updatedAt: profile.updatedAt,
  };
}

export function toAgentProfileSummaryDto(item: AgentProfileListItem) {
  return {
    ...toAgentProfileDto(item.profile),
    latestRevisionFingerprint: item.latestRevisionFingerprint,
    latestRevisionId: item.latestRevisionId,
    latestRevisionNumber: item.latestRevisionNumber,
  };
}

export function toAgentRevisionDto(revision: AgentRevision) {
  const toolNames = new Map(revision.tools.map((tool) => [tool.id, tool.name]));
  return {
    agentProfileId: revision.agentProfileId,
    contentScanStatus: revision.contentScanStatus,
    contentScanVersion: revision.contentScanVersion,
    createdAt: revision.createdAt,
    creationSource: revision.creationSource,
    definitionSchemaVersion: revision.definitionSchemaVersion,
    fingerprint: revision.fingerprint,
    id: revision.id,
    operationalControls: revision.operationalControls,
    permissions: revision.permissions.map((permission) => ({
      capabilityKey: permission.capabilityKey,
      conditions: permission.conditions,
      effect: permission.effect,
      fingerprint: permission.fingerprint,
      id: permission.id,
      ordinal: permission.ordinal,
      requiresConfirmation: permission.requiresConfirmation,
      resourceType: permission.resourceType,
      scope: permission.scope,
      scopeSchemaVersion: permission.scopeSchemaVersion,
      toolDefinitionId: permission.toolDefinitionId ?? null,
      toolName:
        permission.toolDefinitionId === undefined
          ? null
          : (toolNames.get(permission.toolDefinitionId) ?? null),
    })),
    revisionNumber: revision.revisionNumber,
    safeBehaviorNotes: revision.safeBehaviorNotes,
    secretWarningAcknowledgedAt: revision.secretWarningAcknowledgedAt ?? null,
    sourceRevisionId: revision.sourceRevisionId ?? null,
    systemPrompt: revision.systemPrompt,
    tools: revision.tools.map((tool) => ({
      capability: tool.capability,
      description: tool.description,
      displayName: tool.displayName,
      fingerprint: tool.fingerprint,
      id: tool.id,
      inputSchema: tool.inputSchema,
      name: tool.name,
      ordinal: tool.ordinal,
      schemaVersion: tool.schemaVersion,
      simulatorConfig: tool.simulatorConfig,
      simulatorId: tool.simulatorId,
    })),
  };
}
