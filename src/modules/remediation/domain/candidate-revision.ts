import {
  canonicalSerialize,
  deepFreeze,
  type Fingerprint,
  InvariantViolation,
  type UtcTimestamp,
  ValidationError,
} from "../../../shared/domain";
import type {
  AgentRevision,
  AgentRevisionId,
  OperationalControls,
  PermissionGrant,
  ResourceScope,
  ToolDefinition,
} from "../../agent-catalog/domain";
import type { GuardrailChange, GuardrailSet } from "./guardrail-types";
import {
  type CandidateRevisionDraftId,
  candidateRevisionDraftId,
  type GuardrailProposalId,
} from "./ids";

export type CandidateToolDefinition = Omit<ToolDefinition, "fingerprint">;
export type CandidatePermissionGrant = Omit<PermissionGrant, "fingerprint">;

export interface CandidateAgentDefinition {
  readonly systemPrompt: string;
  readonly tools: readonly CandidateToolDefinition[];
  readonly permissions: readonly CandidatePermissionGrant[];
  readonly operationalControls: OperationalControls;
  readonly safeBehaviorNotes: string;
}

export interface CandidateRevisionDraft {
  readonly id: CandidateRevisionDraftId;
  readonly sourceRevisionId: AgentRevisionId;
  readonly expectedSourceFingerprint: Fingerprint;
  readonly reviewedProposalIds: readonly GuardrailProposalId[];
  readonly definition: CandidateAgentDefinition;
  readonly status: "DRAFT" | "REVIEWED";
  readonly createdAt: UtcTimestamp;
  readonly reviewedAt?: UtcTimestamp;
}

function withoutToolFingerprint(tool: ToolDefinition): CandidateToolDefinition {
  const { fingerprint: _fingerprint, ...candidate } = tool;
  return candidate;
}

function withoutPermissionFingerprint(permission: PermissionGrant): CandidatePermissionGrant {
  const { fingerprint: _fingerprint, ...candidate } = permission;
  return candidate;
}

function replacePermissionScope(
  permission: CandidatePermissionGrant,
  replacementScope: ResourceScope,
): CandidatePermissionGrant {
  const currentIds = new Set(permission.scope.resourceIds ?? []);
  const replacementIds = replacementScope.resourceIds ?? [];
  const widensAllResources =
    replacementScope.allSyntheticResources && !permission.scope.allSyntheticResources;
  const addsResource =
    !permission.scope.allSyntheticResources &&
    replacementIds.some((resourceId) => !currentIds.has(resourceId));
  if (widensAllResources || addsResource) {
    throw new InvariantViolation("A permission reduction cannot widen its source scope.");
  }
  return { ...permission, scope: replacementScope };
}

function applyChange(
  definition: CandidateAgentDefinition,
  change: GuardrailChange,
): CandidateAgentDefinition {
  switch (change.type) {
    case "SYSTEM_PROMPT_CHANGE":
      return { ...definition, systemPrompt: change.replacementSystemPrompt };
    case "TOOL_SCHEMA_CHANGE": {
      let found = false;
      const tools = definition.tools.map((tool) => {
        if (tool.id !== change.toolDefinitionId) {
          return tool;
        }
        found = true;
        return { ...tool, inputSchema: change.replacementInputSchema };
      });
      if (!found) {
        throw new ValidationError(
          "Guardrail references an unknown tool definition.",
          "toolDefinitionId",
        );
      }
      return { ...definition, tools };
    }
    case "PERMISSION_REDUCTION": {
      const sourcePermission = definition.permissions.find(
        (permission) => permission.id === change.permissionGrantId,
      );
      if (sourcePermission === undefined) {
        throw new ValidationError(
          "Guardrail references an unknown permission grant.",
          "permissionGrantId",
        );
      }
      if (change.action === "REMOVE") {
        return {
          ...definition,
          permissions: definition.permissions.filter(
            (permission) => permission.id !== change.permissionGrantId,
          ),
        };
      }
      const permissions = definition.permissions.map((permission) => {
        if (permission.id !== change.permissionGrantId) {
          return permission;
        }
        if (change.action === "REQUIRE_CONFIRMATION") {
          return { ...permission, requiresConfirmation: true };
        }
        if (change.replacementScope === undefined) {
          throw new InvariantViolation("NARROW_SCOPE requires a replacement scope.");
        }
        return replacePermissionScope(permission, change.replacementScope);
      });
      return { ...definition, permissions };
    }
    case "CONFIRMATION_GATE": {
      let found = false;
      const permissions = definition.permissions.map((permission) => {
        if (permission.capabilityKey !== change.capabilityKey) {
          return permission;
        }
        found = true;
        return { ...permission, requiresConfirmation: true };
      });
      if (!found) {
        throw new ValidationError(
          "Confirmation gate references a capability without a permission grant.",
          "capabilityKey",
        );
      }
      const confirmationRequiredFor = [
        ...new Set([
          ...definition.operationalControls.confirmationRequiredFor,
          change.capabilityKey,
        ]),
      ];
      return {
        ...definition,
        operationalControls: {
          ...definition.operationalControls,
          confirmationRequiredFor,
        },
        permissions,
      };
    }
    case "OPERATIONAL_CONTROL":
      return {
        ...definition,
        operationalControls: change.replacementOperationalControls,
      };
  }
}

export function deriveCandidateRevisionDraft(
  id: string,
  source: AgentRevision,
  set: GuardrailSet,
  createdAt: UtcTimestamp,
): CandidateRevisionDraft {
  if (set.status !== "READY") {
    throw new InvariantViolation("A candidate draft requires a ready, reviewed guardrail set.");
  }
  if (
    set.sourceAgentRevisionId !== source.id ||
    set.sourceRevisionFingerprint !== source.fingerprint
  ) {
    throw new InvariantViolation("Guardrail source does not match the immutable source revision.");
  }

  const accepted = set.proposals.filter(
    (proposal) => proposal.status === "ACCEPTED" || proposal.status === "EDITED",
  );
  if (accepted.length === 0) {
    throw new InvariantViolation("A candidate draft requires at least one reviewed change.");
  }

  let definition: CandidateAgentDefinition = {
    operationalControls: source.operationalControls,
    permissions: source.permissions.map(withoutPermissionFingerprint),
    safeBehaviorNotes: source.safeBehaviorNotes,
    systemPrompt: source.systemPrompt,
    tools: source.tools.map(withoutToolFingerprint),
  };
  for (const proposal of accepted) {
    definition = applyChange(definition, proposal.proposedChange);
  }

  const sourceDefinition: CandidateAgentDefinition = {
    operationalControls: source.operationalControls,
    permissions: source.permissions.map(withoutPermissionFingerprint),
    safeBehaviorNotes: source.safeBehaviorNotes,
    systemPrompt: source.systemPrompt,
    tools: source.tools.map(withoutToolFingerprint),
  };
  if (canonicalSerialize(definition) === canonicalSerialize(sourceDefinition)) {
    throw new InvariantViolation("Reviewed guardrails do not change the source revision.");
  }

  return deepFreeze({
    createdAt,
    definition,
    expectedSourceFingerprint: source.fingerprint,
    id: candidateRevisionDraftId(id),
    reviewedProposalIds: accepted.map((proposal) => proposal.id),
    sourceRevisionId: source.id,
    status: "DRAFT" as const,
  });
}

export function markCandidateDraftReviewed(
  draft: CandidateRevisionDraft,
  reviewedAt: UtcTimestamp,
): CandidateRevisionDraft {
  if (draft.status !== "DRAFT") {
    throw new InvariantViolation("Candidate revision draft is already reviewed.");
  }
  return deepFreeze({ ...draft, reviewedAt, status: "REVIEWED" as const });
}
