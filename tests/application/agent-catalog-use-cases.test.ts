import { describe, expect, it } from "vitest";

import {
  AgentDefinitionPolicy,
  CreateAgentProfile,
  CreateAgentRevision,
  DEFAULT_OPERATIONAL_CONTROLS_INPUT,
  GetAgentProfile,
  ListAgentProfiles,
  PurgeAgentData,
} from "@/modules/agent-catalog";
import { ConflictError, utcTimestamp } from "@/shared/domain";

import { DeterministicIdGenerator, FixedClock } from "../fixtures/deterministic-runtime";
import { testFingerprintService } from "../unit/domain-builders";
import { InMemoryAgentCatalog } from "./application-fakes";

const definition = {
  operationalControls: DEFAULT_OPERATIONAL_CONTROLS_INPUT,
  permissions: [],
  safeBehaviorNotes: "Refuse requests outside synthetic support scope.",
  systemPrompt: "Assist with synthetic support questions only.",
  tools: [],
} as const;

describe("agent catalog application use cases", () => {
  it("creates and reads a profile with its immutable initial revision", async () => {
    const store = new InMemoryAgentCatalog();
    const clock = new FixedClock(utcTimestamp("2026-07-18T10:00:00.000Z"));
    const create = new CreateAgentProfile(
      store,
      new AgentDefinitionPolicy(testFingerprintService),
      clock,
      new DeterministicIdGenerator(["agent_profile_1", "agent_revision_1"]),
    );
    const created = await create.execute({
      definition,
      description: "Synthetic support",
      name: "Support Desk",
    });

    expect(created.revision.revisionNumber).toBe(1);
    await expect(
      new GetAgentProfile(store, store).execute(created.profile.id),
    ).resolves.toMatchObject({
      profile: { name: "Support Desk" },
      revisions: [{ id: "agent_revision_1" }],
    });
    await expect(new ListAgentProfiles(store).execute()).resolves.toMatchObject({
      items: [{ latestRevisionNumber: 1 }],
    });
  });

  it("appends a new immutable revision and rejects a no-op revision", async () => {
    const store = new InMemoryAgentCatalog();
    const clock = new FixedClock(utcTimestamp("2026-07-18T10:00:00.000Z"));
    const policy = new AgentDefinitionPolicy(testFingerprintService);
    const first = await new CreateAgentProfile(
      store,
      policy,
      clock,
      new DeterministicIdGenerator(["agent_profile_1", "agent_revision_1"]),
    ).execute({ definition, description: "", name: "Support Desk" });
    clock.set(utcTimestamp("2026-07-18T11:00:00.000Z"));

    await expect(
      new CreateAgentRevision(
        store,
        store,
        store,
        policy,
        clock,
        new DeterministicIdGenerator(["agent_revision_2"]),
      ).execute({
        agentProfileId: first.profile.id,
        definition: {
          ...definition,
          systemPrompt: "Assist safely with synthetic support records only.",
        },
      }),
    ).resolves.toMatchObject({ revisionNumber: 2, sourceRevisionId: "agent_revision_1" });

    await expect(
      new CreateAgentRevision(
        store,
        store,
        store,
        policy,
        clock,
        new DeterministicIdGenerator(["agent_revision_3"]),
      ).execute({
        agentProfileId: first.profile.id,
        definition: {
          ...definition,
          systemPrompt: "Assist safely with synthetic support records only.",
        },
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses privacy purge while audit work is active", async () => {
    const store = new InMemoryAgentCatalog();
    const created = await new CreateAgentProfile(
      store,
      new AgentDefinitionPolicy(testFingerprintService),
      new FixedClock(utcTimestamp("2026-07-18T10:00:00.000Z")),
      new DeterministicIdGenerator(["agent_profile_1", "agent_revision_1"]),
    ).execute({ definition, description: "", name: "Support Desk" });
    store.activeAudit = true;
    await expect(
      new PurgeAgentData(store, store).execute(created.profile.id, created.profile.id),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
