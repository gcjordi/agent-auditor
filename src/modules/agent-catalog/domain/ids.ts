import { createEntityIdParser, type EntityId } from "../../../shared/domain";

export type AgentProfileId = EntityId<"AgentProfile">;
export type AgentRevisionId = EntityId<"AgentRevision">;
export type PermissionGrantId = EntityId<"PermissionGrant">;
export type ToolDefinitionId = EntityId<"ToolDefinition">;

export const agentProfileId = createEntityIdParser("AgentProfile");
export const agentRevisionId = createEntityIdParser("AgentRevision");
export const permissionGrantId = createEntityIdParser("PermissionGrant");
export const toolDefinitionId = createEntityIdParser("ToolDefinition");
