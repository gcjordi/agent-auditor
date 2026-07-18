import { describe, expect, it, vi } from "vitest";

import {
  type AgentDefinitionDraft,
  AgentDefinitionPolicy,
  archiveAgentProfile,
  assertNoApparentSecrets,
  CreateAgentProfile,
  CreateAgentRevision,
  DEFAULT_OPERATIONAL_CONTROLS_INPUT,
  GetAgentProfile,
  GetAgentRevision,
  ListAgentProfiles,
  PurgeAgentData,
} from "@/modules/agent-catalog";
import { ConflictError, NotFoundError, utcTimestamp, ValidationError } from "@/shared/domain";

import { DeterministicIdGenerator, FixedClock } from "../fixtures/deterministic-runtime";
import { testFingerprintService } from "../unit/domain-builders";
import { InMemoryAgentCatalog } from "./application-fakes";

const simpleDefinition: AgentDefinitionDraft = {
  operationalControls: DEFAULT_OPERATIONAL_CONTROLS_INPUT,
  permissions: [],
  safeBehaviorNotes: "Refuse requests outside synthetic support scope.",
  systemPrompt: "Assist with synthetic support questions only.",
  tools: [],
};

const richDefinition: AgentDefinitionDraft = {
  operationalControls: {
    confirmationRequiredFor: ["records.read"],
    escalationRequiredFor: [],
    evidenceRequirements: ["TOOL_ATTEMPTS"],
    maxRetries: 1,
    schemaVersion: "1.0.0",
    stopConditions: ["ON_BUDGET_EXHAUSTED"],
  },
  permissions: [
    {
      capabilityKey: "records.read",
      conditions: {
        allowedOperations: ["read"],
        maximumSensitivity: "SYNTHETIC",
        requiresUserIntent: true,
      },
      effect: "ALLOW",
      requiresConfirmation: true,
      resourceType: "synthetic_record",
      scope: { allSyntheticResources: false, resourceIds: ["record_1"] },
      scopeSchemaVersion: "1.0.0",
      toolName: "records-read",
    },
    {
      capabilityKey: "agent.describe",
      effect: "ALLOW",
      requiresConfirmation: false,
      resourceType: "agent_state",
      scope: { allSyntheticResources: true },
      scopeSchemaVersion: "1.0.0",
    },
  ],
  safeBehaviorNotes: "Refuse access outside declared synthetic resources.",
  systemPrompt: "Read only declared synthetic records and preserve the permission boundary.",
  tools: [
    {
      capability: {
        dataSensitivity: "SYNTHETIC",
        destructive: false,
        impact: "MEDIUM",
        key: "records.read",
      },
      description: "Read a record from the synthetic fixture.",
      displayName: "Read synthetic record",
      inputSchema: {
        additionalProperties: false,
        properties: { record_id: { minLength: 1, type: "string" } },
        required: ["record_id"],
        type: "object",
      },
      name: "Records Read",
      schemaVersion: "1.0.0",
      simulatorConfig: {
        fixtureId: "support_records",
        scenarioId: "record_lookup",
        variant: "bounded",
      },
      simulatorId: "synthetic_records",
    },
    {
      capability: {
        dataSensitivity: "PUBLIC",
        destructive: false,
        impact: "LOW",
        key: "notes.search",
      },
      description: "Search public synthetic notes.",
      inputSchema: {
        additionalProperties: false,
        properties: { query: { minLength: 1, type: "string" } },
        required: ["query"],
        type: "object",
      },
      name: "notes_search",
      schemaVersion: "1.0.0",
      simulatorId: "synthetic_notes",
    },
  ],
};

function createProfileUseCase(
  store: InMemoryAgentCatalog,
  ids: readonly string[],
  clock = new FixedClock(utcTimestamp("2026-07-18T13:00:00.000Z")),
) {
  return new CreateAgentProfile(
    store,
    new AgentDefinitionPolicy(testFingerprintService),
    clock,
    new DeterministicIdGenerator(ids),
  );
}

async function persistSimpleProfile(store: InMemoryAgentCatalog) {
  return createProfileUseCase(store, ["agent_profile_1", "agent_revision_1"]).execute({
    definition: simpleDefinition,
    description: "Synthetic support",
    name: "Support Desk",
  });
}

describe("agent catalog application boundaries", () => {
  it("maps optional tool and permission metadata and resolves normalized tool references", async () => {
    const store = new InMemoryAgentCatalog();
    const created = await createProfileUseCase(store, [
      "agent_profile_1",
      "tool_1",
      "tool_2",
      "permission_1",
      "permission_2",
      "agent_revision_1",
    ]).execute({
      definition: richDefinition,
      description: "Synthetic records assistant",
      name: "Records Assistant",
    });

    expect(created.revision.tools).toMatchObject([
      {
        displayName: "Read synthetic record",
        id: "tool_1",
        name: "records_read",
        simulatorConfig: {
          fixtureId: "support_records",
          scenarioId: "record_lookup",
          variant: "bounded",
        },
      },
      { displayName: "notes_search", id: "tool_2", simulatorConfig: {} },
    ]);
    expect(created.revision.permissions).toMatchObject([
      {
        conditions: {
          allowedOperations: ["read"],
          maximumSensitivity: "SYNTHETIC",
          requiresUserIntent: true,
        },
        id: "permission_1",
        scope: { allSyntheticResources: false, resourceIds: ["record_1"] },
        toolDefinitionId: "tool_1",
      },
      {
        capabilityKey: "agent.describe",
        conditions: {},
        id: "permission_2",
        scope: { allSyntheticResources: true },
      },
    ]);
  });

  it("rejects duplicate normalized tool names before persisting a partial profile", async () => {
    const store = new InMemoryAgentCatalog();
    const firstTool = richDefinition.tools[0];
    if (firstTool === undefined) throw new Error("Fixture tool is required.");
    const duplicateDefinition: AgentDefinitionDraft = {
      ...richDefinition,
      permissions: [],
      tools: [firstTool, { ...firstTool, name: "records-read" }],
    };

    await expect(
      createProfileUseCase(store, ["agent_profile_1", "tool_1"]).execute({
        definition: duplicateDefinition,
        description: "",
        name: "Duplicate tool fixture",
      }),
    ).rejects.toThrow("unique after normalization");
    expect(store.profiles.size).toBe(0);
    expect(store.revisions.size).toBe(0);
  });

  it("rejects permissions that name an undeclared tool", async () => {
    const store = new InMemoryAgentCatalog();
    const firstPermission = richDefinition.permissions[0];
    if (firstPermission === undefined) throw new Error("Fixture permission is required.");
    const invalidDefinition: AgentDefinitionDraft = {
      ...richDefinition,
      permissions: [{ ...firstPermission, toolName: "missing_tool" }],
    };

    await expect(
      createProfileUseCase(store, ["agent_profile_1", "tool_1", "tool_2"]).execute({
        definition: invalidDefinition,
        description: "",
        name: "Missing tool fixture",
      }),
    ).rejects.toThrow("reference a declared tool name");
    expect(store.profiles.size).toBe(0);
  });

  it("rejects apparent credentials, secret-bearing fields, and excessive inspection depth", async () => {
    const store = new InMemoryAgentCatalog();
    await expect(
      createProfileUseCase(store, []).execute({
        definition: {
          ...simpleDefinition,
          systemPrompt: "Use Bearer abcdefghijklmnopqrstuvwxyz only for this request.",
        },
        description: "",
        name: "Unsafe definition",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(() => {
      assertNoApparentSecrets({ apiKey: "credential-material" });
    }).toThrow("secret fields are not accepted");

    let deeplyNested: unknown = "safe leaf";
    for (let depth = 0; depth < 25; depth += 1) deeplyNested = { nested: deeplyNested };
    expect(() => {
      assertNoApparentSecrets(deeplyNested);
    }).toThrow("inspection depth limit");
  });

  it("appends a richly declared revision and resolves its tool-scoped permission", async () => {
    const store = new InMemoryAgentCatalog();
    const first = await persistSimpleProfile(store);
    const revised = await new CreateAgentRevision(
      store,
      store,
      store,
      new AgentDefinitionPolicy(testFingerprintService),
      new FixedClock(utcTimestamp("2026-07-18T14:00:00.000Z")),
      new DeterministicIdGenerator([
        "tool_1",
        "tool_2",
        "permission_1",
        "permission_2",
        "agent_revision_2",
      ]),
    ).execute({ agentProfileId: first.profile.id, definition: richDefinition });

    expect(revised).toMatchObject({
      revisionNumber: 2,
      sourceRevisionId: "agent_revision_1",
      tools: [{ id: "tool_1" }, { id: "tool_2" }],
    });
    expect(revised.permissions[0]?.toolDefinitionId).toBe("tool_1");
  });

  it("rejects missing or archived profiles before constructing a revision", async () => {
    const emptyStore = new InMemoryAgentCatalog();
    const buildRevision = (store: InMemoryAgentCatalog) =>
      new CreateAgentRevision(
        store,
        store,
        store,
        new AgentDefinitionPolicy(testFingerprintService),
        new FixedClock(utcTimestamp("2026-07-18T14:00:00.000Z")),
        new DeterministicIdGenerator([]),
      );

    await expect(
      buildRevision(emptyStore).execute({
        agentProfileId: "agent_profile_404",
        definition: simpleDefinition,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    const store = new InMemoryAgentCatalog();
    const created = await persistSimpleProfile(store);
    store.profiles.set(
      created.profile.id,
      archiveAgentProfile(created.profile, utcTimestamp("2026-07-18T13:30:00.000Z")),
    );
    await expect(
      buildRevision(store).execute({
        agentProfileId: created.profile.id,
        definition: richDefinition,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects an undeclared tool reference on subsequent revisions", async () => {
    const store = new InMemoryAgentCatalog();
    const created = await persistSimpleProfile(store);
    const firstPermission = richDefinition.permissions[0];
    if (firstPermission === undefined) throw new Error("Fixture permission is required.");

    await expect(
      new CreateAgentRevision(
        store,
        store,
        store,
        new AgentDefinitionPolicy(testFingerprintService),
        new FixedClock(utcTimestamp("2026-07-18T14:00:00.000Z")),
        new DeterministicIdGenerator(["tool_1", "tool_2"]),
      ).execute({
        agentProfileId: created.profile.id,
        definition: {
          ...richDefinition,
          permissions: [{ ...firstPermission, toolName: "missing_tool" }],
        },
      }),
    ).rejects.toThrow("reference a declared tool");
  });

  it("returns typed not-found errors and forwards a validated list cursor", async () => {
    const store = new InMemoryAgentCatalog();
    await expect(
      new GetAgentProfile(store, store).execute("agent_profile_404"),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(new GetAgentRevision(store).execute("agent_revision_404")).rejects.toBeInstanceOf(
      NotFoundError,
    );

    const list = vi.fn().mockResolvedValue({ items: [] });
    const query = new ListAgentProfiles({ findById: store.findById.bind(store), list });
    await expect(query.execute(5, "agent_profile_1")).resolves.toEqual({ items: [] });
    expect(list).toHaveBeenCalledWith({ cursor: "agent_profile_1", limit: 5 });
  });

  it("requires exact purge confirmation and removes the complete local aggregate", async () => {
    const store = new InMemoryAgentCatalog();
    const created = await persistSimpleProfile(store);
    const purge = new PurgeAgentData(store, store);

    await expect(purge.execute(created.profile.id, "agent_profile_other")).rejects.toBeInstanceOf(
      ConflictError,
    );
    await expect(purge.execute("agent_profile_404", "agent_profile_404")).rejects.toBeInstanceOf(
      NotFoundError,
    );

    await expect(purge.execute(created.profile.id, created.profile.id)).resolves.toEqual({
      auditRunCount: 0,
      comparisonCount: 0,
      evidenceRecordCount: 0,
      profileCount: 1,
      revisionCount: 1,
    });
    expect(store.profiles.size).toBe(0);
    expect(store.revisions.size).toBe(0);
  });
});
