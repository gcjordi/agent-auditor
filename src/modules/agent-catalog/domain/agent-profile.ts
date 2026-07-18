import {
  compareTimestamps,
  deepFreeze,
  InvariantViolation,
  type UtcTimestamp,
  ValidationError,
} from "../../../shared/domain";
import { type AgentProfileId, agentProfileId } from "./ids";

const PROFILE_NAME_MAX_LENGTH = 120;
const PROFILE_DESCRIPTION_MAX_LENGTH = 2_000;

export interface AgentProfile {
  readonly id: AgentProfileId;
  readonly name: string;
  readonly description: string;
  readonly recordVersion: number;
  readonly createdAt: UtcTimestamp;
  readonly updatedAt: UtcTimestamp;
  readonly archivedAt?: UtcTimestamp;
}

export interface CreateAgentProfileInput {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly createdAt: UtcTimestamp;
}

function normalizeName(name: string): string {
  const normalized = name.trim().replace(/\s+/gu, " ");
  if (normalized.length === 0 || normalized.length > PROFILE_NAME_MAX_LENGTH) {
    throw new ValidationError(
      `Agent profile name must contain 1 to ${PROFILE_NAME_MAX_LENGTH} characters.`,
      "name",
    );
  }
  return normalized;
}

function normalizeDescription(description: string | undefined): string {
  const normalized = description?.trim() ?? "";
  if (normalized.length > PROFILE_DESCRIPTION_MAX_LENGTH) {
    throw new ValidationError(
      `Agent profile description must be at most ${PROFILE_DESCRIPTION_MAX_LENGTH} characters.`,
      "description",
    );
  }
  return normalized;
}

export function createAgentProfile(input: CreateAgentProfileInput): AgentProfile {
  return deepFreeze({
    createdAt: input.createdAt,
    description: normalizeDescription(input.description),
    id: agentProfileId(input.id),
    name: normalizeName(input.name),
    recordVersion: 1,
    updatedAt: input.createdAt,
  });
}

export function updateAgentProfile(
  profile: AgentProfile,
  changes: { readonly name: string; readonly description?: string },
  updatedAt: UtcTimestamp,
): AgentProfile {
  if (profile.archivedAt !== undefined) {
    throw new InvariantViolation("An archived agent profile cannot be edited.");
  }
  if (compareTimestamps(updatedAt, profile.updatedAt) < 0) {
    throw new InvariantViolation("Agent profile update time cannot move backwards.");
  }

  return deepFreeze({
    ...profile,
    description: normalizeDescription(changes.description),
    name: normalizeName(changes.name),
    recordVersion: profile.recordVersion + 1,
    updatedAt,
  });
}

export function archiveAgentProfile(profile: AgentProfile, archivedAt: UtcTimestamp): AgentProfile {
  if (profile.archivedAt !== undefined) {
    throw new InvariantViolation("Agent profile is already archived.");
  }
  if (compareTimestamps(archivedAt, profile.updatedAt) < 0) {
    throw new InvariantViolation("Archive time cannot precede the last profile update.");
  }

  return deepFreeze({
    ...profile,
    archivedAt,
    recordVersion: profile.recordVersion + 1,
    updatedAt: archivedAt,
  });
}

export function restoreAgentProfile(profile: AgentProfile, restoredAt: UtcTimestamp): AgentProfile {
  if (profile.archivedAt === undefined) {
    throw new InvariantViolation("Agent profile is not archived.");
  }
  if (compareTimestamps(restoredAt, profile.updatedAt) < 0) {
    throw new InvariantViolation("Restore time cannot precede the archive time.");
  }

  const { archivedAt: _archivedAt, ...activeProfile } = profile;
  return deepFreeze({
    ...activeProfile,
    recordVersion: profile.recordVersion + 1,
    updatedAt: restoredAt,
  });
}
