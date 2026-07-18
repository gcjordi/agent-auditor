import type { Brand, Fingerprint, UtcTimestamp, VersionIdentifier } from "../../../shared/domain";
import type { ObjectSchema } from "./declarative-schema";
import type { AgentProfileId, AgentRevisionId, PermissionGrantId, ToolDefinitionId } from "./ids";

export type ToolName = Brand<string, "ToolName">;
export type CapabilityKey = Brand<string, "CapabilityKey">;
export type SimulatorId = Brand<string, "SimulatorId">;

export type CapabilityImpact = "CRITICAL" | "HIGH" | "LOW" | "MEDIUM";
export type DataSensitivity = "CONFIDENTIAL" | "PUBLIC" | "RESTRICTED" | "SYNTHETIC";
export type PermissionEffect = "ALLOW" | "DENY";
export type CreationSource = "GUARDRAIL" | "SYNTHETIC_SEED" | "USER";
export type ContentScanStatus = "CLEAR" | "WARNING_ACKNOWLEDGED";

export interface DeclaredCapability {
  readonly dataSensitivity: DataSensitivity;
  readonly destructive: boolean;
  readonly impact: CapabilityImpact;
  readonly key: CapabilityKey;
}

export interface SimulatorConfig {
  readonly fixtureId?: string;
  readonly scenarioId?: string;
  readonly variant?: string;
}

export interface ResourceScope {
  readonly allSyntheticResources: boolean;
  readonly resourceIds?: readonly string[];
}

export interface PermissionConditions {
  readonly allowedOperations?: readonly string[];
  readonly maximumSensitivity?: DataSensitivity;
  readonly requiresUserIntent?: boolean;
}

export interface ToolDefinition {
  readonly id: ToolDefinitionId;
  readonly name: ToolName;
  readonly displayName: string;
  readonly description: string;
  readonly schemaVersion: VersionIdentifier;
  readonly inputSchema: ObjectSchema;
  readonly simulatorId: SimulatorId;
  readonly simulatorConfig: SimulatorConfig;
  readonly capability: DeclaredCapability;
  readonly ordinal: number;
  readonly fingerprint: Fingerprint;
}

export interface PermissionGrant {
  readonly id: PermissionGrantId;
  readonly toolDefinitionId?: ToolDefinitionId;
  readonly effect: PermissionEffect;
  readonly capabilityKey: CapabilityKey;
  readonly resourceType: string;
  readonly scopeSchemaVersion: VersionIdentifier;
  readonly scope: ResourceScope;
  readonly conditions: PermissionConditions;
  readonly requiresConfirmation: boolean;
  readonly ordinal: number;
  readonly fingerprint: Fingerprint;
}

export type StopCondition =
  "ON_AMBIGUOUS_INTENT" | "ON_BUDGET_EXHAUSTED" | "ON_PERMISSION_DENIAL" | "ON_SIMULATOR_ERROR";

export type EvidenceRequirement =
  "ASSERTION_RESULTS" | "PERMISSION_DECISIONS" | "SIMULATOR_OUTCOMES" | "TOOL_ATTEMPTS";

export interface OperationalControls {
  readonly schemaVersion: VersionIdentifier;
  readonly maxRetries: number;
  readonly stopConditions: readonly StopCondition[];
  readonly escalationRequiredFor: readonly CapabilityKey[];
  readonly confirmationRequiredFor: readonly CapabilityKey[];
  readonly evidenceRequirements: readonly EvidenceRequirement[];
}

export const DEFAULT_OPERATIONAL_CONTROLS_INPUT = Object.freeze({
  confirmationRequiredFor: [],
  escalationRequiredFor: [],
  evidenceRequirements: ["ASSERTION_RESULTS", "PERMISSION_DECISIONS", "TOOL_ATTEMPTS"],
  maxRetries: 0,
  schemaVersion: "1.0.0",
  stopConditions: ["ON_BUDGET_EXHAUSTED", "ON_PERMISSION_DENIAL", "ON_SIMULATOR_ERROR"],
} as const);

export interface ToolDefinitionInput {
  readonly id: string;
  readonly name: string;
  readonly displayName?: string | undefined;
  readonly description: string;
  readonly schemaVersion: string;
  readonly inputSchema: unknown;
  readonly simulatorId: string;
  readonly simulatorConfig?: Readonly<Record<string, unknown>> | undefined;
  readonly capability: {
    readonly dataSensitivity: DataSensitivity;
    readonly destructive: boolean;
    readonly impact: CapabilityImpact;
    readonly key: string;
  };
}

export interface PermissionGrantInput {
  readonly id: string;
  readonly toolDefinitionId?: string | undefined;
  readonly effect: PermissionEffect;
  readonly capabilityKey: string;
  readonly resourceType: string;
  readonly scopeSchemaVersion: string;
  readonly scope: {
    readonly allSyntheticResources: boolean;
    readonly resourceIds?: readonly string[] | undefined;
  };
  readonly conditions?:
    | {
        readonly allowedOperations?: readonly string[] | undefined;
        readonly maximumSensitivity?: DataSensitivity | undefined;
        readonly requiresUserIntent?: boolean | undefined;
      }
    | undefined;
  readonly requiresConfirmation: boolean;
}

export interface OperationalControlsInput {
  readonly schemaVersion: string;
  readonly maxRetries: number;
  readonly stopConditions: readonly StopCondition[];
  readonly escalationRequiredFor: readonly string[];
  readonly confirmationRequiredFor: readonly string[];
  readonly evidenceRequirements: readonly EvidenceRequirement[];
}

export interface AgentRevision {
  readonly id: AgentRevisionId;
  readonly agentProfileId: AgentProfileId;
  readonly revisionNumber: number;
  readonly sourceRevisionId?: AgentRevisionId;
  readonly systemPrompt: string;
  readonly tools: readonly ToolDefinition[];
  readonly permissions: readonly PermissionGrant[];
  readonly operationalControls: OperationalControls;
  readonly safeBehaviorNotes: string;
  readonly definitionSchemaVersion: VersionIdentifier;
  readonly contentScanVersion: VersionIdentifier;
  readonly contentScanStatus: ContentScanStatus;
  readonly secretWarningAcknowledgedAt?: UtcTimestamp;
  readonly creationSource: CreationSource;
  readonly fingerprint: Fingerprint;
  readonly createdAt: UtcTimestamp;
}

export interface CreateAgentRevisionInput {
  readonly id: string;
  readonly agentProfileId: string;
  readonly revisionNumber: number;
  readonly sourceRevisionId?: string | undefined;
  readonly systemPrompt: string;
  readonly tools: readonly ToolDefinitionInput[];
  readonly permissions: readonly PermissionGrantInput[];
  readonly operationalControls: OperationalControlsInput;
  readonly safeBehaviorNotes?: string | undefined;
  readonly definitionSchemaVersion: string;
  readonly contentScanVersion: string;
  readonly contentScanStatus: ContentScanStatus;
  readonly secretWarningAcknowledgedAt?: UtcTimestamp | undefined;
  readonly creationSource: CreationSource;
  readonly createdAt: UtcTimestamp;
}

export interface AgentDefinitionPolicyOptions {
  readonly allowedSimulatorIds?: ReadonlySet<string>;
}
