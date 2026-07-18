"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { MUTATION_TOKEN_HEADER } from "@/shared/application/http-contract";
import { Alert, Button } from "@/shared/presentation/components";

const configSchema = z.object({ data: z.object({ mutationToken: z.string().min(1) }) });
const auditSchema = z.object({ data: z.object({ id: z.string().min(1) }) });

export function QueueAuditButton({
  agentId,
  agentRevisionId,
}: {
  readonly agentId: string;
  readonly agentRevisionId: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function queueAudit(): Promise<void> {
    setError(undefined);
    setSubmitting(true);
    try {
      const config = configSchema.parse(
        await (await fetch("/api/v1/config", { cache: "no-store" })).json(),
      );
      const response = await fetch(`/api/v1/agents/${encodeURIComponent(agentId)}/audits`, {
        body: JSON.stringify({ agentRevisionId, mode: "DEMO" }),
        headers: {
          "content-type": "application/json",
          "idempotency-key": crypto.randomUUID(),
          [MUTATION_TOKEN_HEADER]: config.data.mutationToken,
        },
        method: "POST",
      });
      if (!response.ok) throw new Error("The Demo audit could not be queued.");
      const audit = auditSchema.parse(await response.json());
      router.push(`/audits/${encodeURIComponent(audit.data.id)}`);
      router.refresh();
    } catch (cause: unknown) {
      setError(cause instanceof Error ? cause.message : "The Demo audit could not be queued.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-3">
      {error === undefined ? null : <Alert tone="danger">{error}</Alert>}
      <div>
        <Button disabled={submitting} onClick={() => void queueAudit()}>
          {submitting ? "Queueing…" : "Queue Demo audit"}
        </Button>
      </div>
    </div>
  );
}
