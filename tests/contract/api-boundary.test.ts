import { describe, expect, it } from "vitest";

import { toAgentRevisionDto } from "@/modules/agent-catalog/presentation/agent-dto";
import { createAgentRequestSchema } from "@/modules/agent-catalog/presentation/contracts";
import {
  createAuditRequestSchema,
  idempotencyKeySchema,
} from "@/modules/auditing/presentation/contracts";

import { makeRevision } from "../unit/domain-builders";

describe("API boundary schemas", () => {
  it("normalizes the smallest valid agent request", () => {
    const request = createAgentRequestSchema.parse({
      definition: { systemPrompt: "Assist only with synthetic support records." },
      name: "Support Desk",
    });
    expect(request.description).toBe("");
    expect(request.definition.tools).toEqual([]);
    expect(request.definition.operationalControls.maxRetries).toBe(0);
  });

  it("rejects executable tool metadata", () => {
    const result = createAgentRequestSchema.safeParse({
      definition: {
        systemPrompt: "Synthetic only",
        tools: [
          {
            capability: {
              dataSensitivity: "SYNTHETIC",
              destructive: false,
              impact: "LOW",
              key: "records.read",
            },
            command: "run-this",
            description: "Read synthetic records",
            inputSchema: {
              additionalProperties: false,
              properties: {},
              required: [],
              type: "object",
            },
            name: "read_records",
            simulatorId: "synthetic_records",
          },
        ],
      },
      name: "Unsafe metadata",
    });
    expect(result.success).toBe(false);
  });

  it("requires a stable idempotency key and explicit revision for audits", () => {
    expect(idempotencyKeySchema.safeParse("short").success).toBe(false);
    expect(createAuditRequestSchema.parse({ agentRevisionId: "revision-1", mode: "DEMO" })).toEqual(
      { agentRevisionId: "revision-1", mode: "DEMO" },
    );
  });

  it("preserves immutable revision provenance in the response DTO", () => {
    const dto = toAgentRevisionDto(makeRevision());

    expect(dto.contentScanVersion).toBe("1.0.0");
    expect(dto.secretWarningAcknowledgedAt).toBeNull();
    expect(dto.tools).toHaveLength(1);
    expect(dto.tools[0]).toMatchObject({ ordinal: 0, schemaVersion: "1.0.0" });
    expect(dto.permissions).toHaveLength(1);
    expect(dto.permissions[0]).toMatchObject({ ordinal: 0, scopeSchemaVersion: "1.0.0" });
    expect(typeof dto.permissions[0]?.toolDefinitionId).toBe("string");
  });
});
