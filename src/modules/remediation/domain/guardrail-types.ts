import type { Fingerprint, UtcTimestamp } from "../../../shared/domain";
import type {
  AgentRevisionId,
  CapabilityKey,
  ObjectSchema,
  OperationalControls,
  PermissionGrantId,
  ResourceScope,
  ToolDefinitionId,
} from "../../agent-catalog/domain";
import type { AuditRunId, FindingId } from "../../auditing/domain";
import type { GuardrailProposalId, GuardrailSetId } from "./ids";

export type GuardrailProposalStatus = "ACCEPTED" | "APPLIED" | "EDITED" | "PROPOSED" | "REJECTED";
export type GuardrailBehaviorChangeRisk = "HIGH" | "LOW" | "MEDIUM";

export type GuardrailSetStatus = "APPLIED" | "IN_REVIEW" | "PROPOSED" | "READY" | "REJECTED";

export type GuardrailChange =
  | {
      readonly type: "SYSTEM_PROMPT_CHANGE";
      readonly replacementSystemPrompt: string;
    }
  | {
      readonly type: "TOOL_SCHEMA_CHANGE";
      readonly toolDefinitionId: ToolDefinitionId;
      readonly replacementInputSchema: ObjectSchema;
    }
  | {
      readonly type: "PERMISSION_REDUCTION";
      readonly permissionGrantId: PermissionGrantId;
      readonly action: "NARROW_SCOPE" | "REMOVE" | "REQUIRE_CONFIRMATION";
      readonly replacementScope?: ResourceScope;
    }
  | {
      readonly type: "CONFIRMATION_GATE";
      readonly capabilityKey: CapabilityKey;
    }
  | {
      readonly type: "OPERATIONAL_CONTROL";
      readonly replacementOperationalControls: OperationalControls;
    };

export interface GuardrailProposal {
  readonly id: GuardrailProposalId;
  readonly linkedFindingIds: readonly FindingId[];
  readonly defenseInDepthRationale?: string;
  readonly title: string;
  readonly rationale: string;
  readonly proposedChange: GuardrailChange;
  readonly expectedEffect: string;
  readonly tradeOffs: string;
  readonly riskOfBehaviorChange: GuardrailBehaviorChangeRisk;
  readonly priority: number;
  readonly expectedSourceFingerprint: Fingerprint;
  readonly status: GuardrailProposalStatus;
}

export interface GuardrailProposalInput extends Omit<
  GuardrailProposal,
  "defenseInDepthRationale" | "id" | "status"
> {
  readonly id: string;
  readonly defenseInDepthRationale?: string;
}

export interface GuardrailSet {
  readonly id: GuardrailSetId;
  readonly sourceAuditRunId: AuditRunId;
  readonly sourceAgentRevisionId: AgentRevisionId;
  readonly sourceRevisionFingerprint: Fingerprint;
  readonly proposals: readonly GuardrailProposal[];
  readonly status: GuardrailSetStatus;
  readonly recordVersion: number;
  readonly appliedAgentRevisionId?: AgentRevisionId;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly appliedAt?: UtcTimestamp;
}

export interface CreateGuardrailSetInput extends Omit<
  GuardrailSet,
  "appliedAgentRevisionId" | "appliedAt" | "id" | "recordVersion" | "status" | "updatedAt"
> {
  readonly id: string;
  readonly sourceAuditStatus: "COMPLETED";
}
