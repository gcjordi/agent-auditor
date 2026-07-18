import {
  fingerprintCanonical,
  type FingerprintService,
  ValidationError,
  versionIdentifier,
} from "../../../shared/domain";
import type {
  AgentDefinitionPolicyOptions,
  CapabilityKey,
  OperationalControls,
  OperationalControlsInput,
  SimulatorConfig,
  SimulatorId,
  ToolDefinition,
  ToolDefinitionInput,
  ToolName,
} from "./agent-definition-types";
import { validateToolInputSchema } from "./declarative-schema";
import { toolDefinitionId } from "./ids";

const MAX_TOOL_COUNT = 32;
const IDENTIFIER_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const CONFIG_VALUE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/u;

export function boundedText(
  value: string,
  field: string,
  maxLength: number,
  allowEmpty: boolean,
): string {
  const normalized = value.trim();
  if ((!allowEmpty && normalized.length === 0) || normalized.length > maxLength) {
    const minimum = allowEmpty ? 0 : 1;
    throw new ValidationError(
      `${field} must contain ${minimum} to ${maxLength} characters.`,
      field,
    );
  }
  return normalized;
}

export function normalizedIdentifier<Value extends ToolName | CapabilityKey | SimulatorId>(
  value: string,
  field: string,
): Value {
  const normalized = value
    .trim()
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s-]+/gu, "_");
  if (normalized.length > 128 || !IDENTIFIER_PATTERN.test(normalized)) {
    throw new ValidationError(
      `${field} must be a lowercase declarative identifier without paths or code characters.`,
      field,
    );
  }
  return normalized as Value;
}

export function normalizeToolName(value: string): ToolName {
  return normalizedIdentifier<ToolName>(value, "tool.name");
}

export function capabilityKey(value: string): CapabilityKey {
  return normalizedIdentifier<CapabilityKey>(value, "capabilityKey");
}

function simulatorId(value: string): SimulatorId {
  return normalizedIdentifier<SimulatorId>(value, "simulatorId");
}

export function uniqueValues<Value extends string>(
  values: readonly Value[],
  field: string,
): readonly Value[] {
  if (new Set(values).size !== values.length) {
    throw new ValidationError(`${field} contains duplicate values.`, field);
  }
  return values;
}

function normalizedSelector(value: unknown, field: string): string {
  if (typeof value !== "string" || !CONFIG_VALUE_PATTERN.test(value)) {
    throw new ValidationError(`${field} must be a safe synthetic selector.`, field);
  }
  return value;
}

export function normalizeStringList(
  values: readonly string[] | undefined,
  field: string,
  maximum = 100,
): readonly string[] {
  if ((values?.length ?? 0) > maximum) {
    throw new ValidationError(`${field} may contain at most ${maximum} entries.`, field);
  }
  const normalized = (values ?? []).map((value) => normalizedSelector(value, field));
  return uniqueValues(normalized, field);
}

function normalizeSimulatorConfig(
  input: Readonly<Record<string, unknown>> | undefined,
): SimulatorConfig {
  const allowedKeys = new Set(["fixtureId", "scenarioId", "variant"]);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(input ?? {})) {
    if (!allowedKeys.has(key)) {
      throw new ValidationError(
        `Unsupported simulator configuration field "${key}"; only synthetic selectors are allowed.`,
        "simulatorConfig",
      );
    }
    result[key] = normalizedSelector(value, `simulatorConfig.${key}`);
  }
  return result as SimulatorConfig;
}

export function normalizeOperationalControls(input: OperationalControlsInput): OperationalControls {
  if (!Number.isSafeInteger(input.maxRetries) || input.maxRetries < 0 || input.maxRetries > 3) {
    throw new ValidationError("Operational maxRetries must be between 0 and 3.", "maxRetries");
  }
  return {
    confirmationRequiredFor: uniqueValues(
      input.confirmationRequiredFor.map(capabilityKey),
      "confirmationRequiredFor",
    ),
    escalationRequiredFor: uniqueValues(
      input.escalationRequiredFor.map(capabilityKey),
      "escalationRequiredFor",
    ),
    evidenceRequirements: uniqueValues(input.evidenceRequirements, "evidenceRequirements"),
    maxRetries: input.maxRetries,
    schemaVersion: versionIdentifier(input.schemaVersion),
    stopConditions: uniqueValues(input.stopConditions, "stopConditions"),
  };
}

export function buildTools(
  inputs: readonly ToolDefinitionInput[],
  service: FingerprintService,
  options: AgentDefinitionPolicyOptions,
): readonly ToolDefinition[] {
  if (inputs.length > MAX_TOOL_COUNT) {
    throw new ValidationError(
      `An agent revision may declare at most ${MAX_TOOL_COUNT} tools.`,
      "tools",
    );
  }
  const tools = inputs.map((input, ordinal): ToolDefinition => {
    const name = normalizeToolName(input.name);
    const configuredSimulatorId = simulatorId(input.simulatorId);
    if (
      options.allowedSimulatorIds !== undefined &&
      !options.allowedSimulatorIds.has(configuredSimulatorId)
    ) {
      throw new ValidationError(
        `Simulator "${configuredSimulatorId}" is not in the closed simulator catalog.`,
        "simulatorId",
      );
    }
    const fingerprintInput = {
      capability: { ...input.capability, key: capabilityKey(input.capability.key) },
      description: boundedText(input.description, "tool.description", 2_000, false),
      displayName: boundedText(input.displayName ?? input.name, "tool.displayName", 120, false),
      inputSchema: validateToolInputSchema(input.inputSchema),
      name,
      schemaVersion: versionIdentifier(input.schemaVersion),
      simulatorConfig: normalizeSimulatorConfig(input.simulatorConfig),
      simulatorId: configuredSimulatorId,
    };
    return {
      ...fingerprintInput,
      fingerprint: fingerprintCanonical(fingerprintInput, service),
      id: toolDefinitionId(input.id),
      ordinal,
    };
  });

  if (new Set(tools.map((tool) => tool.name)).size !== tools.length) {
    throw new ValidationError("Tool names must be unique after normalization.", "tools");
  }
  if (new Set(tools.map((tool) => tool.id)).size !== tools.length) {
    throw new ValidationError("Tool definition IDs must be unique.", "tools");
  }
  if (new Set(tools.map((tool) => tool.capability.key)).size !== tools.length) {
    throw new ValidationError("Declared capability keys must be unique.", "tools");
  }
  return tools;
}
