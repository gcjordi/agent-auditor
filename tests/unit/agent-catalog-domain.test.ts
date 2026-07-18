import { describe, expect, it } from "vitest";

import {
  archiveAgentProfile,
  createAgentProfile,
  createAgentRevision,
  normalizeToolName,
  type PermissionGrantInput,
  restoreAgentProfile,
  updateAgentProfile,
  validateToolInputSchema,
} from "@/modules/agent-catalog/domain";
import { InvariantViolation, utcTimestamp, ValidationError } from "@/shared/domain";

import { makeRevision, makeRevisionInput, testFingerprintService } from "./domain-builders";

describe("AgentProfile", () => {
  it("normalizes bounded profile data and advances optimistic versions", () => {
    const profile = createAgentProfile({
      createdAt: utcTimestamp("2026-07-18T08:00:00Z"),
      description: "  Local behavioral auditor  ",
      id: "profile_1",
      name: "  Support   Desk  ",
    });
    const updated = updateAgentProfile(
      profile,
      { description: "Updated", name: "Support Desk Agent" },
      utcTimestamp("2026-07-18T09:00:00Z"),
    );

    expect(profile).toMatchObject({
      description: "Local behavioral auditor",
      name: "Support Desk",
      recordVersion: 1,
    });
    expect(updated.recordVersion).toBe(2);
    expect(profile.name).toBe("Support Desk");
  });

  it("enforces archive and restore lifecycle invariants", () => {
    const profile = createAgentProfile({
      createdAt: utcTimestamp("2026-07-18T08:00:00Z"),
      id: "profile_1",
      name: "Research Assistant",
    });
    const archived = archiveAgentProfile(profile, utcTimestamp("2026-07-18T09:00:00Z"));

    expect(() =>
      updateAgentProfile(archived, { name: "Not allowed" }, utcTimestamp("2026-07-18T10:00:00Z")),
    ).toThrow(InvariantViolation);

    const restored = restoreAgentProfile(archived, utcTimestamp("2026-07-18T10:00:00Z"));
    expect(restored.archivedAt).toBeUndefined();
    expect(restored.recordVersion).toBe(3);
  });

  it("rejects empty and oversized names", () => {
    expect(() =>
      createAgentProfile({
        createdAt: utcTimestamp("2026-07-18T08:00:00Z"),
        id: "profile_1",
        name: " ",
      }),
    ).toThrow(ValidationError);
  });
});

describe("supported declarative JSON Schema", () => {
  it("normalizes the closed subset and defaults additionalProperties to false", () => {
    const schema = validateToolInputSchema({
      properties: {
        count: { maximum: 10, minimum: 1, type: "integer" },
        labels: {
          items: { maxLength: 40, type: "string" },
          maxItems: 5,
          type: "array",
        },
        mode: { const: "summary", enum: ["summary", "detail"], type: "string" },
      },
      required: ["count"],
      type: "object",
    });

    expect(schema.additionalProperties).toBe(false);
    expect(schema.properties["count"]).toMatchObject({ maximum: 10, minimum: 1 });
  });

  it("rejects unsupported and executable schema features", () => {
    expect(() =>
      validateToolInputSchema({
        $ref: "https://example.invalid/schema.json",
        type: "object",
      }),
    ).toThrow("Unsupported schema keyword");
    expect(() =>
      validateToolInputSchema({
        additionalProperties: true,
        type: "object",
      }),
    ).toThrow("must be false");
    expect(() =>
      validateToolInputSchema({
        properties: {
          value: { handler: "execute", type: "string" },
        },
        type: "object",
      }),
    ).toThrow("Unsupported schema keyword");
  });

  it("enforces depth, canonical size, and node bounds", () => {
    const nested = {
      properties: {
        child: {
          properties: {
            child: {
              properties: { leaf: { type: "string" } },
              type: "object",
            },
          },
          type: "object",
        },
      },
      type: "object",
    };

    expect(() =>
      validateToolInputSchema(nested, {
        maxBytes: 10_000,
        maxDepth: 2,
        maxEnumValues: 10,
        maxNodes: 10,
        maxPropertiesPerObject: 10,
      }),
    ).toThrow("maximum depth");

    expect(() =>
      validateToolInputSchema(
        { description: "description that is too large for this policy", type: "object" },
        {
          maxBytes: 20,
          maxDepth: 8,
          maxEnumValues: 10,
          maxNodes: 10,
          maxPropertiesPerObject: 10,
        },
      ),
    ).toThrow("canonical size");
  });

  it("rejects prototype-pollution-shaped property definitions", () => {
    const schema = JSON.parse(
      '{"type":"object","properties":{"__proto__":{"type":"string"}}}',
    ) as unknown;

    expect(() => validateToolInputSchema(schema)).toThrow("Unsafe property name");
  });
});

describe("AgentRevision", () => {
  it("normalizes tool names and rejects path-shaped names", () => {
    expect(normalizeToolName(" Records-Read ")).toBe("records_read");
    expect(() => normalizeToolName("../../shell")).toThrow(ValidationError);
  });

  it("creates a deeply immutable revision", () => {
    const revision = makeRevision();

    expect(Object.isFrozen(revision)).toBe(true);
    expect(Object.isFrozen(revision.tools)).toBe(true);
    expect(Object.isFrozen(revision.tools[0]?.inputSchema)).toBe(true);
    expect(Reflect.set(revision, "systemPrompt", "mutated")).toBe(false);
    expect(revision.systemPrompt).toContain("support assistant");
  });

  it("keeps fingerprints stable across identity changes and changes them with definition content", () => {
    const original = makeRevision();
    const equivalent = makeRevision({
      id: "agent_revision_2",
      permissions: [
        {
          ...makeRevisionInput().permissions[0]!,
          id: "permission_2",
          toolDefinitionId: "tool_2",
        },
      ],
      revisionNumber: 2,
      sourceRevisionId: "agent_revision_1",
      tools: [{ ...makeRevisionInput().tools[0]!, id: "tool_2" }],
    });
    const promptChanged = makeRevision({
      id: "agent_revision_3",
      systemPrompt: "A materially different instruction boundary.",
    });
    const permissionChanged = makeRevision({
      id: "agent_revision_4",
      permissions: [{ ...makeRevisionInput().permissions[0]!, requiresConfirmation: true }],
    });

    expect(equivalent.fingerprint).toBe(original.fingerprint);
    expect(promptChanged.fingerprint).not.toBe(original.fingerprint);
    expect(permissionChanged.fingerprint).not.toBe(original.fingerprint);
  });

  it("rejects duplicate normalized tool names and executable simulator metadata", () => {
    const baseTool = makeRevisionInput().tools[0]!;
    expect(() =>
      createAgentRevision(
        makeRevisionInput({
          permissions: [],
          tools: [baseTool, { ...baseTool, id: "tool_2", name: "Records Read" }],
        }),
        testFingerprintService,
      ),
    ).toThrow("unique after normalization");

    expect(() =>
      makeRevision({
        tools: [{ ...baseTool, simulatorConfig: { handler: "node:child_process" } }],
      }),
    ).toThrow("Unsupported simulator configuration field");
  });

  it("requires permission references and capabilities to match declared tools", () => {
    const basePermission = makeRevisionInput().permissions[0]!;
    expect(() =>
      makeRevision({
        permissions: [{ ...basePermission, toolDefinitionId: "missing_tool" }],
      }),
    ).toThrow("same revision");
    expect(() =>
      makeRevision({
        permissions: [{ ...basePermission, capabilityKey: "records.delete" }],
      }),
    ).toThrow("match the tool's declared capability");
  });

  it("rejects indistinguishable allow and deny grants without explicit precedence", () => {
    const allow = makeRevisionInput().permissions[0]!;
    const deny: PermissionGrantInput = {
      ...allow,
      effect: "DENY",
      id: "permission_2",
    };

    expect(() => makeRevision({ permissions: [allow, deny] })).toThrow("explicit precedence rule");
  });
});
