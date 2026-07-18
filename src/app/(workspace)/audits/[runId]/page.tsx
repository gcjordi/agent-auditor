import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getApplicationContainer } from "@/bootstrap";
import { CancelAuditButton } from "@/modules/auditing/presentation/components/cancel-audit-button";
import { DemoAuditExperience } from "@/modules/auditing/presentation/components/demo-audit-experience";
import { DEMO_AUDIT_SLUG } from "@/modules/auditing/presentation/demo-audit-fixture";
import { NotFoundError } from "@/shared/domain";
import { Alert, AppLink, Badge, Card } from "@/shared/presentation/components";
import { formatUtcInstant } from "@/shared/presentation/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit run" };
interface PageProps {
  readonly params: Promise<{ readonly runId: string }>;
}

export default async function AuditRunPage({ params }: PageProps) {
  const { runId } = await params;
  if (runId === DEMO_AUDIT_SLUG) return <DemoAuditExperience />;

  let run;
  try {
    const application = await getApplicationContainer();
    run = await application.audits.get.execute(runId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const cancellable = ["QUEUED", "PLANNING", "EXECUTING", "EVALUATING"].includes(run.status);
  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
            Audit run
          </p>
          <h1 className="text-3xl font-black">{run.id}</h1>
          <p className="mt-2 text-[var(--text-muted)]">
            Created {formatUtcInstant(run.createdAt)} UTC
          </p>
        </div>
        <AppLink href="/audits" variant="secondary">
          Back to audits
        </AppLink>
      </div>
      <Alert tone="warning">
        The complete audit engine is not part of this phase. This run contains lifecycle provenance
        only—no findings, evidence conclusions, score, or security certification.
      </Alert>
      <Card className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Current state</h2>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Phase {run.currentPhase} · Attempt {run.attemptNumber}
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
        </div>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-bold text-[var(--text-muted)]">Mode</dt>
            <dd>{run.mode}</dd>
          </div>
          <div>
            <dt className="font-bold text-[var(--text-muted)]">Agent revision</dt>
            <dd className="font-mono">{run.agentRevisionId}</dd>
          </div>
          <div>
            <dt className="font-bold text-[var(--text-muted)]">Planned cases</dt>
            <dd>{run.plannedCaseCount}</dd>
          </div>
          <div>
            <dt className="font-bold text-[var(--text-muted)]">Completed cases</dt>
            <dd>{run.completedCaseCount}</dd>
          </div>
        </dl>
        {run.failure === undefined ? null : (
          <Alert tone="danger">
            <strong>{run.failure.code}</strong>: {run.failure.summary}
          </Alert>
        )}
        {cancellable ? <CancelAuditButton auditRunId={run.id} /> : null}
      </Card>
    </div>
  );
}
