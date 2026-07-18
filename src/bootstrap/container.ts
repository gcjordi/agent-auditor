import "server-only";

import {
  AgentDefinitionPolicy,
  CreateAgentProfile,
  CreateAgentRevision,
  GetAgentProfile,
  GetAgentRevision,
  ListAgentProfiles,
  PurgeAgentData,
} from "@/modules/agent-catalog";
import { PrismaAgentCatalogRepository } from "@/modules/agent-catalog/infrastructure";
import {
  AuditCoordinator,
  CreateAuditRun,
  GetAuditRun,
  ListAuditRuns,
  ReconcileInterruptedAudits,
  RequestAuditCancellation,
} from "@/modules/auditing";
import { PrismaAuditRepository } from "@/modules/auditing/infrastructure";
import { getServerConfig } from "@/shared/infrastructure/config";
import { createPinoLogger } from "@/shared/infrastructure/logging";
import {
  Sha256FingerprintService,
  SystemClock,
  UuidGenerator,
} from "@/shared/infrastructure/runtime";
import { closedSimulatorIds } from "@/shared/infrastructure/simulation";

import { getPrismaClient } from "./prisma-client";

export interface ApplicationContainer {
  readonly agents: {
    readonly create: CreateAgentProfile;
    readonly createRevision: CreateAgentRevision;
    readonly get: GetAgentProfile;
    readonly getRevision: GetAgentRevision;
    readonly list: ListAgentProfiles;
    readonly purge: PurgeAgentData;
  };
  readonly audits: {
    readonly cancel: RequestAuditCancellation;
    readonly coordinator: AuditCoordinator;
    readonly create: CreateAuditRun;
    readonly get: GetAuditRun;
    readonly list: ListAuditRuns;
    readonly reconcile: ReconcileInterruptedAudits;
  };
  readonly logger: ReturnType<typeof createPinoLogger>;
}

let container: Promise<ApplicationContainer> | undefined;

export function getApplicationContainer(): Promise<ApplicationContainer> {
  container ??= createApplicationContainer();
  return container;
}

async function createApplicationContainer(): Promise<ApplicationContainer> {
  const config = getServerConfig();
  const client = await getPrismaClient();
  const clock = new SystemClock();
  const ids = new UuidGenerator();
  const fingerprints = new Sha256FingerprintService();
  const agentRepository = new PrismaAgentCatalogRepository(client, fingerprints);
  const auditRepository = new PrismaAuditRepository(client);
  const definitionPolicy = new AgentDefinitionPolicy(fingerprints, {
    allowedSimulatorIds: closedSimulatorIds,
  });

  return {
    agents: {
      create: new CreateAgentProfile(agentRepository, definitionPolicy, clock, ids),
      createRevision: new CreateAgentRevision(
        agentRepository,
        agentRepository,
        agentRepository,
        definitionPolicy,
        clock,
        ids,
      ),
      get: new GetAgentProfile(agentRepository, agentRepository),
      getRevision: new GetAgentRevision(agentRepository),
      list: new ListAgentProfiles(agentRepository),
      purge: new PurgeAgentData(agentRepository, agentRepository),
    },
    audits: {
      cancel: new RequestAuditCancellation(auditRepository, clock),
      coordinator: new AuditCoordinator(auditRepository, clock, `local-${process.pid}`, {
        maximumConcurrency: config.audit.concurrency,
      }),
      create: new CreateAuditRun(agentRepository, auditRepository, clock, ids, fingerprints, {
        demoSeed: config.demo.seed,
        maximumDurationSeconds: config.audit.maximumDurationSeconds,
        maximumTestCases: config.audit.maximumTestCases,
      }),
      get: new GetAuditRun(auditRepository),
      list: new ListAuditRuns(auditRepository),
      reconcile: new ReconcileInterruptedAudits(auditRepository, clock),
    },
    logger: createPinoLogger(config.logLevel),
  };
}
