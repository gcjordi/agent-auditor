import type {
  CapabilityImpact,
  DataSensitivity,
  EvidenceRequirement,
  OperationalControlsInput,
  PermissionEffect,
  PermissionGrantInput,
  StopCondition,
  ToolDefinitionInput,
} from "../domain";

export interface ToolDefinitionDraft {
  readonly capability: {
    readonly dataSensitivity: DataSensitivity;
    readonly destructive: boolean;
    readonly impact: CapabilityImpact;
    readonly key: string;
  };
  readonly description: string;
  readonly displayName?: string | undefined;
  readonly inputSchema: unknown;
  readonly name: string;
  readonly schemaVersion: string;
  readonly simulatorConfig?:
    | {
        readonly fixtureId?: string | undefined;
        readonly scenarioId?: string | undefined;
        readonly variant?: string | undefined;
      }
    | undefined;
  readonly simulatorId: string;
}

export interface PermissionGrantDraft {
  readonly capabilityKey: string;
  readonly conditions?:
    | {
        readonly allowedOperations?: readonly string[] | undefined;
        readonly maximumSensitivity?: DataSensitivity | undefined;
        readonly requiresUserIntent?: boolean | undefined;
      }
    | undefined;
  readonly effect: PermissionEffect;
  readonly requiresConfirmation: boolean;
  readonly resourceType: string;
  readonly scope: {
    readonly allSyntheticResources: boolean;
    readonly resourceIds?: readonly string[] | undefined;
  };
  readonly scopeSchemaVersion: string;
  readonly toolName?: string | undefined;
}

export interface OperationalControlsDraft {
  readonly confirmationRequiredFor: readonly string[];
  readonly escalationRequiredFor: readonly string[];
  readonly evidenceRequirements: readonly EvidenceRequirement[];
  readonly maxRetries: number;
  readonly schemaVersion: string;
  readonly stopConditions: readonly StopCondition[];
}

export interface AgentDefinitionDraft {
  readonly operationalControls: OperationalControlsDraft;
  readonly permissions: readonly PermissionGrantDraft[];
  readonly safeBehaviorNotes: string;
  readonly systemPrompt: string;
  readonly tools: readonly ToolDefinitionDraft[];
}

export function toToolDefinitionInput(draft: ToolDefinitionDraft, id: string): ToolDefinitionInput {
  const simulatorConfig = {
    ...(draft.simulatorConfig?.fixtureId === undefined
      ? {}
      : { fixtureId: draft.simulatorConfig.fixtureId }),
    ...(draft.simulatorConfig?.scenarioId === undefined
      ? {}
      : { scenarioId: draft.simulatorConfig.scenarioId }),
    ...(draft.simulatorConfig?.variant === undefined
      ? {}
      : { variant: draft.simulatorConfig.variant }),
  };
  return {
    capability: draft.capability,
    description: draft.description,
    ...(draft.displayName === undefined ? {} : { displayName: draft.displayName }),
    id,
    inputSchema: draft.inputSchema,
    name: draft.name,
    schemaVersion: draft.schemaVersion,
    simulatorConfig,
    simulatorId: draft.simulatorId,
  };
}

export function toPermissionGrantInput(
  draft: PermissionGrantDraft,
  id: string,
  toolDefinitionId: string | undefined,
): PermissionGrantInput {
  const conditions = {
    ...(draft.conditions?.allowedOperations === undefined
      ? {}
      : { allowedOperations: draft.conditions.allowedOperations }),
    ...(draft.conditions?.maximumSensitivity === undefined
      ? {}
      : { maximumSensitivity: draft.conditions.maximumSensitivity }),
    ...(draft.conditions?.requiresUserIntent === undefined
      ? {}
      : { requiresUserIntent: draft.conditions.requiresUserIntent }),
  };
  const scope = {
    allSyntheticResources: draft.scope.allSyntheticResources,
    ...(draft.scope.resourceIds === undefined ? {} : { resourceIds: draft.scope.resourceIds }),
  };
  return {
    capabilityKey: draft.capabilityKey,
    conditions,
    effect: draft.effect,
    id,
    requiresConfirmation: draft.requiresConfirmation,
    resourceType: draft.resourceType,
    scope,
    scopeSchemaVersion: draft.scopeSchemaVersion,
    ...(toolDefinitionId === undefined ? {} : { toolDefinitionId }),
  };
}

export function toOperationalControlsInput(
  draft: OperationalControlsDraft,
): OperationalControlsInput {
  return { ...draft };
}
