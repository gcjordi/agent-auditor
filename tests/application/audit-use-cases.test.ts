import { describe, expect, it } from "vitest";

import {
  AgentDefinitionPolicy,
  CreateAgentProfile,
  DEFAULT_OPERATIONAL_CONTROLS_INPUT,
} from "@/modules/agent-catalog";
import {
  CreateAuditRun,
  ReconcileInterruptedAudits,
  RequestAuditCancellation,
} from "@/modules/auditing";
import { ApplicationError } from "@/shared/application";
import { utcTimestamp } from "@/shared/domain";

import { DeterministicIdGenerator, FixedClock } from "../fixtures/deterministic-runtime";
import { testFingerprintService } from "../unit/domain-builders";
import { InMemoryAgentCatalog, InMemoryAuditStore } from "./application-fakes";

async function fixture() {
  const catalog = new InMemoryAgentCatalog();
  const clock = new FixedClock(utcTimestamp("2026-07-18T10:00:00.000Z"));
  const agent = await new CreateAgentProfile(
    catalog,
    new AgentDefinitionPolicy(testFingerprintService),
    clock,
    new DeterministicIdGenerator(["agent_profile_1", "agent_revision_1"]),
  ).execute({
    definition: {
      operationalControls: DEFAULT_OPERATIONAL_CONTROLS_INPUT,
      permissions: [],
      safeBehaviorNotes: "",
      systemPrompt: "Use synthetic data only.",
      tools: [],
    },
    description: "",
    name: "Research Assistant",
  });
  return { agent, catalog, clock, store: new InMemoryAuditStore() };
}

describe("audit application use cases", () => {
  it("queues a truthful Demo run and replays the same idempotent intent", async () => {
    const { agent, catalog, clock, store } = await fixture();
    const create = new CreateAuditRun(
      catalog,
      store,
      clock,
      new DeterministicIdGenerator(["audit_run_1", "audit_job_1", "audit_run_2", "audit_job_2"]),
      testFingerprintService,
      { demoSeed: "demo-seed", maximumDurationSeconds: 300, maximumTestCases: 24 },
    );
    const command = {
      agentRevisionId: agent.revision.id,
      idempotencyKey: "audit-request-1",
      mode: "DEMO" as const,
    };
    await expect(create.execute(command)).resolves.toMatchObject({
      created: true,
      run: { status: "QUEUED" },
    });
    await expect(create.execute(command)).resolves.toMatchObject({
      created: false,
      run: { id: "audit_run_1" },
    });
  });

  it("keeps Live Mode explicitly disabled without requesting a key", async () => {
    const { agent, catalog, clock, store } = await fixture();
    const create = new CreateAuditRun(
      catalog,
      store,
      clock,
      new DeterministicIdGenerator([]),
      testFingerprintService,
      { demoSeed: "demo-seed", maximumDurationSeconds: 300, maximumTestCases: 24 },
    );
    await expect(
      create.execute({
        agentRevisionId: agent.revision.id,
        idempotencyKey: "live-request-1",
        mode: "LIVE",
      }),
    ).rejects.toBeInstanceOf(ApplicationError);
  });

  it("persists cancellation intent and computes bounded reconciliation input", async () => {
    const { agent, catalog, clock, store } = await fixture();
    const create = new CreateAuditRun(
      catalog,
      store,
      clock,
      new DeterministicIdGenerator(["audit_run_1", "audit_job_1"]),
      testFingerprintService,
      { demoSeed: "demo-seed", maximumDurationSeconds: 300, maximumTestCases: 24 },
    );
    const queued = await create.execute({
      agentRevisionId: agent.revision.id,
      idempotencyKey: "audit-request-1",
      mode: "DEMO",
    });
    await expect(
      new RequestAuditCancellation(store, clock).execute(queued.run.id),
    ).resolves.toMatchObject({ status: "CANCELLED" });
    await new ReconcileInterruptedAudits(store, clock).execute();
    expect(store.lastReconcileCommand).toMatchObject({ maximumAttempts: 3 });
  });
});
