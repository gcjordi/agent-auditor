import {
  canonicalSerialize,
  fingerprintCanonical,
  type FingerprintService,
  ValidationError,
  versionIdentifier,
} from "../../../shared/domain";
import type {
  CapabilityKey,
  PermissionConditions,
  PermissionEffect,
  PermissionGrant,
  PermissionGrantInput,
  ResourceScope,
  ToolDefinition,
} from "./agent-definition-types";
import { permissionGrantId, toolDefinitionId } from "./ids";
import { capabilityKey, normalizedIdentifier, normalizeStringList } from "./tool-definition-policy";

const MAX_PERMISSION_COUNT = 128;

export function buildPermissions(
  inputs: readonly PermissionGrantInput[],
  tools: readonly ToolDefinition[],
  service: FingerprintService,
): readonly PermissionGrant[] {
  if (inputs.length > MAX_PERMISSION_COUNT) {
    throw new ValidationError(
      `An agent revision may declare at most ${MAX_PERMISSION_COUNT} permission grants.`,
      "permissions",
    );
  }

  const toolsById = new Map(tools.map((tool) => [tool.id, tool]));
  const permissions = inputs.map((input, ordinal): PermissionGrant => {
    const referencedToolId =
      input.toolDefinitionId === undefined ? undefined : toolDefinitionId(input.toolDefinitionId);
    const tool = referencedToolId === undefined ? undefined : toolsById.get(referencedToolId);
    if (referencedToolId !== undefined && tool === undefined) {
      throw new ValidationError(
        "Every tool-scoped permission must reference a tool in the same revision.",
        "toolDefinitionId",
      );
    }

    const normalizedCapabilityKey = capabilityKey(input.capabilityKey);
    if (tool === undefined && !normalizedCapabilityKey.startsWith("agent.")) {
      throw new ValidationError(
        "Agent-wide permissions must use an agent.* capability key.",
        "capabilityKey",
      );
    }
    if (tool !== undefined && tool.capability.key !== normalizedCapabilityKey) {
      throw new ValidationError(
        "A tool-scoped permission capability must match the tool's declared capability.",
        "capabilityKey",
      );
    }

    const resourceType = normalizedIdentifier<CapabilityKey>(input.resourceType, "resourceType");
    const scope: ResourceScope = {
      allSyntheticResources: input.scope.allSyntheticResources,
      ...(input.scope.resourceIds === undefined
        ? {}
        : { resourceIds: normalizeStringList(input.scope.resourceIds, "scope.resourceIds") }),
    };
    if (scope.allSyntheticResources && (scope.resourceIds?.length ?? 0) > 0) {
      throw new ValidationError(
        "A permission scope cannot select all resources and specific resources together.",
        "scope",
      );
    }

    const conditions: PermissionConditions = {
      ...(input.conditions?.allowedOperations === undefined
        ? {}
        : {
            allowedOperations: normalizeStringList(
              input.conditions.allowedOperations,
              "conditions.allowedOperations",
            ),
          }),
      ...(input.conditions?.maximumSensitivity === undefined
        ? {}
        : { maximumSensitivity: input.conditions.maximumSensitivity }),
      ...(input.conditions?.requiresUserIntent === undefined
        ? {}
        : { requiresUserIntent: input.conditions.requiresUserIntent }),
    };
    const fingerprintInput = {
      capabilityKey: normalizedCapabilityKey,
      conditions,
      effect: input.effect,
      requiresConfirmation: input.requiresConfirmation,
      resourceType,
      scope,
      scopeSchemaVersion: versionIdentifier(input.scopeSchemaVersion),
      toolName: tool?.name ?? null,
    };
    return {
      capabilityKey: normalizedCapabilityKey,
      conditions,
      effect: input.effect,
      fingerprint: fingerprintCanonical(fingerprintInput, service),
      id: permissionGrantId(input.id),
      ordinal,
      requiresConfirmation: input.requiresConfirmation,
      resourceType,
      scope,
      scopeSchemaVersion: fingerprintInput.scopeSchemaVersion,
      ...(referencedToolId === undefined ? {} : { toolDefinitionId: referencedToolId }),
    };
  });

  if (new Set(permissions.map((permission) => permission.id)).size !== permissions.length) {
    throw new ValidationError("Permission grant IDs must be unique.", "permissions");
  }
  if (
    new Set(permissions.map((permission) => permission.fingerprint)).size !== permissions.length
  ) {
    throw new ValidationError(
      "Duplicate or indistinguishable permission grants are not allowed.",
      "permissions",
    );
  }

  const scopes = new Map<string, PermissionEffect>();
  for (const permission of permissions) {
    const scopeKey = canonicalSerialize({
      capabilityKey: permission.capabilityKey,
      conditions: permission.conditions,
      resourceType: permission.resourceType,
      scope: permission.scope,
      toolDefinitionId: permission.toolDefinitionId ?? null,
    });
    const existing = scopes.get(scopeKey);
    if (existing !== undefined && existing !== permission.effect) {
      throw new ValidationError(
        "ALLOW and DENY grants with indistinguishable scope require an explicit precedence rule.",
        "permissions",
      );
    }
    scopes.set(scopeKey, permission.effect);
  }
  return permissions;
}
