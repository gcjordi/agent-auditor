import type { Metadata } from "next";
import Link from "next/link";

import { getApplicationContainer } from "@/bootstrap";
import { Badge, Card, EmptyState, ErrorState } from "@/shared/presentation/components";
import { formatUtcInstant } from "@/shared/presentation/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audits" };

export default async function AuditsPage() {
  let runs;
  try {
    const application = await getApplicationContainer();
    runs = await application.audits.list.execute(100);
  } catch {
    return <ErrorState description="Audit runs could not be read from the local database." />;
  }
  return (
    <div className="grid gap-7">
      <div>
        <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
          Persisted queue
        </p>
        <h1 className="text-3xl font-black">Audit runs</h1>
        <p className="mt-2 max-w-3xl text-[var(--text-muted)]">
          Truthful lifecycle state for Demo audits. No findings or scores are fabricated in this
          foundation.
        </p>
      </div>
      {runs.length === 0 ? (
        <EmptyState
          actionHref="/agents"
          actionLabel="Choose an agent"
          description="Queue a Demo audit from an agent detail page."
          title="No audit runs"
        />
      ) : (
        <div className="grid gap-4">
          {runs.map((run) => (
            <Card className="flex flex-wrap items-center justify-between gap-4" key={run.id}>
              <div>
                <h2 className="font-bold">
                  <Link href={`/audits/${run.id}`}>
                    {run.mode} audit · {run.id.slice(0, 8)}
                  </Link>
                </h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Queued {formatUtcInstant(run.createdAt)} UTC · Phase {run.currentPhase}
                </p>
              </div>
              <Badge
                tone={
                  run.status === "FAILED"
                    ? "danger"
                    : run.status === "CANCELLED"
                      ? "warning"
                      : "neutral"
                }
              >
                {run.status}
              </Badge>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
