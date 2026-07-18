import {
  canonicalSerialize,
  compareTimestamps,
  deepFreeze,
  InvariantViolation,
  type UtcTimestamp,
  ValidationError,
} from "../../../shared/domain";
import type { AgentRevisionId } from "../../agent-catalog/domain";
import type {
  CreateGuardrailSetInput,
  GuardrailChange,
  GuardrailProposal,
  GuardrailProposalInput,
  GuardrailSet,
} from "./guardrail-types";
import { type GuardrailProposalId, guardrailProposalId, guardrailSetId } from "./ids";

function boundedText(value: string, field: string, maximum: number): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > maximum) {
    throw new ValidationError(`${field} must contain 1 to ${maximum} characters.`, field);
  }
  return normalized;
}

function validateChange(change: GuardrailChange): GuardrailChange {
  if (change.type === "SYSTEM_PROMPT_CHANGE") {
    return {
      ...change,
      replacementSystemPrompt: boundedText(
        change.replacementSystemPrompt,
        "replacementSystemPrompt",
        64_000,
      ),
    };
  }
  if (change.type === "PERMISSION_REDUCTION") {
    if ((change.action === "NARROW_SCOPE") !== (change.replacementScope !== undefined)) {
      throw new ValidationError(
        "A NARROW_SCOPE change requires a replacement scope, and other actions must not include one.",
        "replacementScope",
      );
    }
    if (
      change.replacementScope?.allSyntheticResources === true &&
      (change.replacementScope.resourceIds?.length ?? 0) > 0
    ) {
      throw new ValidationError(
        "A replacement scope cannot select all resources and named resources together.",
        "replacementScope",
      );
    }
  }
  return change;
}

export function createGuardrailProposal(input: GuardrailProposalInput): GuardrailProposal {
  const defenseInDepthRationale = input.defenseInDepthRationale?.trim();
  if (input.linkedFindingIds.length === 0 && !defenseInDepthRationale) {
    throw new InvariantViolation(
      "A guardrail proposal must reference a finding or state a defense-in-depth rationale.",
    );
  }
  if (new Set(input.linkedFindingIds).size !== input.linkedFindingIds.length) {
    throw new ValidationError("Linked finding IDs must be unique.", "linkedFindingIds");
  }
  if (!Number.isSafeInteger(input.priority) || input.priority < 0 || input.priority > 1_000) {
    throw new ValidationError(
      "Guardrail priority must be an integer between 0 and 1,000.",
      "priority",
    );
  }
  if (!new Set(["HIGH", "LOW", "MEDIUM"]).has(input.riskOfBehaviorChange)) {
    throw new ValidationError("Guardrail behavior-change risk is invalid.", "riskOfBehaviorChange");
  }

  return deepFreeze({
    ...input,
    ...(defenseInDepthRationale === undefined
      ? {}
      : {
          defenseInDepthRationale: boundedText(
            defenseInDepthRationale,
            "defenseInDepthRationale",
            2_000,
          ),
        }),
    expectedEffect: boundedText(input.expectedEffect, "expectedEffect", 2_000),
    id: guardrailProposalId(input.id),
    proposedChange: validateChange(input.proposedChange),
    rationale: boundedText(input.rationale, "rationale", 3_000),
    status: "PROPOSED" as const,
    title: boundedText(input.title, "title", 200),
    tradeOffs: boundedText(input.tradeOffs, "tradeOffs", 2_000),
  });
}

export function createGuardrailSet(input: CreateGuardrailSetInput): GuardrailSet {
  if (input.sourceAuditStatus !== "COMPLETED") {
    throw new InvariantViolation("Guardrail proposals require a completed source audit.");
  }
  if (input.proposals.length === 0) {
    throw new InvariantViolation("A guardrail set requires at least one proposal.");
  }
  if (new Set(input.proposals.map((proposal) => proposal.id)).size !== input.proposals.length) {
    throw new ValidationError("Guardrail proposal IDs must be unique within a set.", "proposals");
  }
  if (
    input.proposals.some(
      (proposal) => proposal.expectedSourceFingerprint !== input.sourceRevisionFingerprint,
    )
  ) {
    throw new InvariantViolation(
      "Every proposal must target the set's source revision fingerprint.",
    );
  }

  const { sourceAuditStatus: _sourceAuditStatus, ...setInput } = input;
  return deepFreeze({
    ...setInput,
    id: guardrailSetId(input.id),
    recordVersion: 1,
    status: "PROPOSED" as const,
    updatedAt: input.createdAt,
  });
}

function updateSet(
  set: GuardrailSet,
  changes: Partial<GuardrailSet>,
  updatedAt: UtcTimestamp,
): GuardrailSet {
  if (compareTimestamps(updatedAt, set.updatedAt) < 0) {
    throw new InvariantViolation("Guardrail set timestamps cannot move backwards.");
  }
  return deepFreeze({
    ...set,
    ...changes,
    recordVersion: set.recordVersion + 1,
    updatedAt,
  });
}

export function beginGuardrailReview(set: GuardrailSet, updatedAt: UtcTimestamp): GuardrailSet {
  if (set.status !== "PROPOSED") {
    throw new InvariantViolation("Only a proposed guardrail set can enter review.");
  }
  return updateSet(set, { status: "IN_REVIEW" }, updatedAt);
}

export function decideGuardrailProposal(
  set: GuardrailSet,
  proposalId: GuardrailProposalId,
  decision: "ACCEPTED" | "EDITED" | "REJECTED",
  updatedAt: UtcTimestamp,
  editedChange?: GuardrailChange,
): GuardrailSet {
  if (set.status !== "IN_REVIEW") {
    throw new InvariantViolation("Guardrail decisions require an in-review set.");
  }
  if ((decision === "EDITED") !== (editedChange !== undefined)) {
    throw new ValidationError(
      "An EDITED decision requires an edited change, and other decisions do not accept one.",
      "editedChange",
    );
  }
  let found = false;
  const proposals = set.proposals.map((proposal) => {
    if (proposal.id !== proposalId) {
      return proposal;
    }
    found = true;
    if (proposal.status !== "PROPOSED") {
      throw new InvariantViolation("A decided proposal cannot be decided again.");
    }
    return deepFreeze({
      ...proposal,
      ...(editedChange === undefined ? {} : { proposedChange: validateChange(editedChange) }),
      status: decision,
    });
  });
  if (!found) {
    throw new ValidationError("Guardrail proposal was not found in this set.", "proposalId");
  }
  return updateSet(set, { proposals }, updatedAt);
}

function proposalTargetKey(change: GuardrailChange): string {
  switch (change.type) {
    case "CONFIRMATION_GATE":
      return `capability:${change.capabilityKey}:confirmation`;
    case "OPERATIONAL_CONTROL":
      return "operational-controls";
    case "PERMISSION_REDUCTION":
      return `permission:${change.permissionGrantId}`;
    case "SYSTEM_PROMPT_CHANGE":
      return "system-prompt";
    case "TOOL_SCHEMA_CHANGE":
      return `tool:${change.toolDefinitionId}:schema`;
  }
}

export function markGuardrailSetReady(set: GuardrailSet, updatedAt: UtcTimestamp): GuardrailSet {
  if (set.status !== "IN_REVIEW") {
    throw new InvariantViolation("Only an in-review guardrail set can become ready.");
  }
  if (set.proposals.some((proposal) => proposal.status === "PROPOSED")) {
    throw new InvariantViolation("Every guardrail proposal requires a reviewer decision.");
  }
  const accepted = set.proposals.filter(
    (proposal) => proposal.status === "ACCEPTED" || proposal.status === "EDITED",
  );
  if (accepted.length === 0) {
    throw new InvariantViolation("A ready guardrail set requires an accepted or edited proposal.");
  }

  const changesByTarget = new Map<string, string>();
  for (const proposal of accepted) {
    const target = proposalTargetKey(proposal.proposedChange);
    const serialized = canonicalSerialize(proposal.proposedChange);
    const existing = changesByTarget.get(target);
    if (existing !== undefined && existing !== serialized) {
      throw new InvariantViolation(`Accepted guardrail proposals conflict on ${target}.`);
    }
    changesByTarget.set(target, serialized);
  }

  return updateSet(set, { status: "READY" }, updatedAt);
}

export function rejectGuardrailSet(set: GuardrailSet, updatedAt: UtcTimestamp): GuardrailSet {
  if (set.status !== "IN_REVIEW") {
    throw new InvariantViolation("Only an in-review guardrail set can be rejected.");
  }
  return updateSet(set, { status: "REJECTED" }, updatedAt);
}

export function applyGuardrailSet(
  set: GuardrailSet,
  appliedAgentRevisionId: AgentRevisionId,
  appliedAt: UtcTimestamp,
): GuardrailSet {
  if (set.status === "APPLIED" && set.appliedAgentRevisionId === appliedAgentRevisionId) {
    return set;
  }
  if (set.status !== "READY") {
    throw new InvariantViolation("Only a ready guardrail set can be applied.");
  }
  const proposals = set.proposals.map((proposal) =>
    proposal.status === "ACCEPTED" || proposal.status === "EDITED"
      ? deepFreeze({ ...proposal, status: "APPLIED" as const })
      : proposal,
  );
  return updateSet(
    set,
    {
      appliedAgentRevisionId,
      appliedAt,
      proposals,
      status: "APPLIED",
    },
    appliedAt,
  );
}
