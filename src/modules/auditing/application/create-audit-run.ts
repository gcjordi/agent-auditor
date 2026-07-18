import { agentRevisionId, type AgentRevisionRepository } from "@/modules/agent-catalog";
import { ApplicationError } from "@/shared/application";
import {
  type Clock,
  createEntityIdParser,
  fingerprintCanonical,
  type FingerprintService,
  type IdGenerator,
  NotFoundError,
  versionIdentifier,
} from "@/shared/domain";

import { type AuditMode, type AuditRun, createAuditRun as createAuditRunEntity } from "../domain";
import type { AuditRunRepository } from "./ports";

const parseAuditJobId = createEntityIdParser("AuditJob");

export interface AuditRuntimeSettings {
  readonly demoSeed: string;
  readonly maximumDurationSeconds: number;
  readonly maximumTestCases: number;
}

export interface CreateAuditRunCommand {
  readonly expectedAgentProfileId?: string;
  readonly agentRevisionId: string;
  readonly idempotencyKey: string;
  readonly mode: AuditMode;
}

export interface QueuedAuditRun {
  readonly created: boolean;
  readonly run: AuditRun;
}

export class CreateAuditRun {
  constructor(
    private readonly revisions: AgentRevisionRepository,
    private readonly runs: AuditRunRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly fingerprints: FingerprintService,
    private readonly settings: AuditRuntimeSettings,
  ) {}

  async execute(command: CreateAuditRunCommand): Promise<QueuedAuditRun> {
    if (command.mode === "LIVE") {
      throw new ApplicationError(
        "LIVE_MODE_UNAVAILABLE",
        "Live Mode is disabled in this keyless foundation. Queue a Demo audit instead.",
      );
    }
    const revision = await this.revisions.findRevisionById(
      agentRevisionId(command.agentRevisionId),
    );
    if (
      revision === null ||
      (command.expectedAgentProfileId !== undefined &&
        revision.agentProfileId !== command.expectedAgentProfileId)
    ) {
      throw new NotFoundError("The requested agent revision was not found for this profile.");
    }
    const requestIntent = {
      agentProfileId: revision.agentProfileId,
      agentRevisionFingerprint: revision.fingerprint,
      agentRevisionId: revision.id,
      budget: {
        maxCases: this.settings.maximumTestCases,
        maxDurationMs: this.settings.maximumDurationSeconds * 1_000,
        maxModelOutputTokensPerCase: 4_096,
        maxStepsPerCase: 12,
        maxToolAttemptsPerCase: 8,
      },
      engineVersion: "0.1.0",
      evaluationPolicyVersion: "1.0.0",
      fixtureVersion: "1.0.0",
      mode: command.mode,
      runPurpose: "BASELINE",
      scoringPolicyVersion: "1.0.0",
      taxonomyVersion: "1.0.0",
    } as const;
    const requestFingerprint = fingerprintCanonical(requestIntent, this.fingerprints);
    const createdAt = this.clock.now();
    const run = createAuditRunEntity({
      agentRevisionFingerprint: revision.fingerprint,
      agentRevisionId: revision.id,
      budget: requestIntent.budget,
      createdAt,
      engineVersion: versionIdentifier(requestIntent.engineVersion),
      evaluationPolicyVersion: versionIdentifier(requestIntent.evaluationPolicyVersion),
      fixtureVersion: versionIdentifier(requestIntent.fixtureVersion),
      id: this.ids.next(),
      idempotencyKey: command.idempotencyKey,
      mode: "DEMO",
      runPurpose: "BASELINE",
      scoringPolicyVersion: versionIdentifier(requestIntent.scoringPolicyVersion),
      seed: `${this.settings.demoSeed}:${command.idempotencyKey}`,
      taxonomyVersion: versionIdentifier(requestIntent.taxonomyVersion),
    });
    const result = await this.runs.createRunWithJob({
      jobId: parseAuditJobId(this.ids.next()),
      requestFingerprint,
      run,
    });
    return { created: result.created, run: result.run };
  }
}
