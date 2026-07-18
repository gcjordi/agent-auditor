import { createEntityIdParser, type EntityId } from "../../../shared/domain";

export type CandidateRevisionDraftId = EntityId<"CandidateRevisionDraft">;
export type GuardrailProposalId = EntityId<"GuardrailProposal">;
export type GuardrailSetId = EntityId<"GuardrailSet">;

export const candidateRevisionDraftId = createEntityIdParser("CandidateRevisionDraft");
export const guardrailProposalId = createEntityIdParser("GuardrailProposal");
export const guardrailSetId = createEntityIdParser("GuardrailSet");
