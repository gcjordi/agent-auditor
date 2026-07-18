import {
  deepFreeze,
  fingerprintCanonical,
  type FingerprintService,
  InvariantViolation,
  ValidationError,
  versionIdentifier,
} from "../../../shared/domain";
import type {
  AgentDefinitionPolicyOptions,
  AgentRevision,
  CreateAgentRevisionInput,
} from "./agent-definition-types";
import { agentProfileId, agentRevisionId } from "./ids";
import { buildPermissions } from "./permission-policy";
import { boundedText, buildTools, normalizeOperationalControls } from "./tool-definition-policy";

const MAX_SYSTEM_PROMPT_LENGTH = 64_000;
const MAX_SAFE_BEHAVIOR_NOTES_LENGTH = 8_000;

export function agentRevisionFingerprintInput(
  revision: Pick<
    AgentRevision,
    | "definitionSchemaVersion"
    | "operationalControls"
    | "permissions"
    | "safeBehaviorNotes"
    | "systemPrompt"
    | "tools"
  >,
): unknown {
  const toolNames = new Map(revision.tools.map((tool) => [tool.id, tool.name]));
  return {
    definitionSchemaVersion: revision.definitionSchemaVersion,
    operationalControls: revision.operationalControls,
    permissions: revision.permissions.map(
      ({ fingerprint: _fingerprint, id: _id, ...permission }) => ({
        ...permission,
        toolDefinitionId:
          permission.toolDefinitionId === undefined
            ? null
            : (toolNames.get(permission.toolDefinitionId) ?? null),
      }),
    ),
    safeBehaviorNotes: revision.safeBehaviorNotes,
    systemPrompt: revision.systemPrompt,
    tools: revision.tools.map(({ fingerprint: _fingerprint, id: _id, ...tool }) => tool),
  };
}

export function createAgentRevision(
  input: CreateAgentRevisionInput,
  service: FingerprintService,
  options: AgentDefinitionPolicyOptions = {},
): AgentRevision {
  if (!Number.isSafeInteger(input.revisionNumber) || input.revisionNumber < 1) {
    throw new ValidationError("Revision number must be a positive integer.", "revisionNumber");
  }

  const id = agentRevisionId(input.id);
  const sourceRevisionId =
    input.sourceRevisionId === undefined ? undefined : agentRevisionId(input.sourceRevisionId);
  if (sourceRevisionId === id) {
    throw new InvariantViolation("An agent revision cannot name itself as its source.");
  }
  if (
    (input.contentScanStatus === "CLEAR" && input.secretWarningAcknowledgedAt !== undefined) ||
    (input.contentScanStatus === "WARNING_ACKNOWLEDGED" &&
      input.secretWarningAcknowledgedAt === undefined)
  ) {
    throw new ValidationError(
      "Secret warning acknowledgement metadata must match the content scan status.",
      "contentScanStatus",
    );
  }

  const tools = buildTools(input.tools, service, options);
  const permissions = buildPermissions(input.permissions, tools, service);
  const operationalControls = normalizeOperationalControls(input.operationalControls);
  const declaredCapabilities = new Set(tools.map((tool) => tool.capability.key));
  for (const key of [
    ...operationalControls.confirmationRequiredFor,
    ...operationalControls.escalationRequiredFor,
  ]) {
    if (!declaredCapabilities.has(key) && !key.startsWith("agent.")) {
      throw new ValidationError(
        `Operational control references undeclared capability "${key}".`,
        "operationalControls",
      );
    }
  }

  const revisionWithoutFingerprint = {
    agentProfileId: agentProfileId(input.agentProfileId),
    contentScanStatus: input.contentScanStatus,
    contentScanVersion: versionIdentifier(input.contentScanVersion),
    createdAt: input.createdAt,
    creationSource: input.creationSource,
    definitionSchemaVersion: versionIdentifier(input.definitionSchemaVersion),
    id,
    operationalControls,
    permissions,
    revisionNumber: input.revisionNumber,
    safeBehaviorNotes: boundedText(
      input.safeBehaviorNotes ?? "",
      "safeBehaviorNotes",
      MAX_SAFE_BEHAVIOR_NOTES_LENGTH,
      true,
    ),
    systemPrompt: boundedText(input.systemPrompt, "systemPrompt", MAX_SYSTEM_PROMPT_LENGTH, false),
    tools,
    ...(input.secretWarningAcknowledgedAt === undefined
      ? {}
      : { secretWarningAcknowledgedAt: input.secretWarningAcknowledgedAt }),
    ...(sourceRevisionId === undefined ? {} : { sourceRevisionId }),
  };
  const fingerprint = fingerprintCanonical(
    agentRevisionFingerprintInput(revisionWithoutFingerprint),
    service,
  );
  return deepFreeze({ ...revisionWithoutFingerprint, fingerprint });
}

export class AgentDefinitionPolicy {
  constructor(
    private readonly fingerprintService: FingerprintService,
    private readonly options: AgentDefinitionPolicyOptions = {},
  ) {}

  createRevision(input: CreateAgentRevisionInput): AgentRevision {
    return createAgentRevision(input, this.fingerprintService, this.options);
  }
}
