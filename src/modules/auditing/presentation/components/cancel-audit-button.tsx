"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { z } from "zod";

import { MUTATION_TOKEN_HEADER } from "@/shared/application/http-contract";
import { Alert, Button } from "@/shared/presentation/components";

const configSchema = z.object({ data: z.object({ mutationToken: z.string().min(1) }) });

export function CancelAuditButton({ auditRunId }: { readonly auditRunId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [submitting, setSubmitting] = useState(false);

  async function cancel(): Promise<void> {
    setError(undefined);
    setSubmitting(true);
    try {
      const config = configSchema.parse(
        await (await fetch("/api/v1/config", { cache: "no-store" })).json(),
      );
      const response = await fetch(`/api/v1/audits/${encodeURIComponent(auditRunId)}/cancel`, {
        headers: { [MUTATION_TOKEN_HEADER]: config.data.mutationToken },
        method: "POST",
      });
      if (!response.ok) throw new Error("The cancellation request could not be saved.");
      router.refresh();
    } catch (cause: unknown) {
      setError(
        cause instanceof Error ? cause.message : "The cancellation request could not be saved.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-3">
      {error === undefined ? null : <Alert tone="danger">{error}</Alert>}
      <div>
        <Button disabled={submitting} onClick={() => void cancel()} variant="secondary">
          {submitting ? "Saving…" : "Cancel audit"}
        </Button>
      </div>
    </div>
  );
}
