import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getApplicationContainer } from "@/bootstrap";
import { QueueAuditButton } from "@/modules/auditing/presentation/components/queue-audit-button";
import { NotFoundError } from "@/shared/domain";
import { AppLink, Badge, Card, EmptyState } from "@/shared/presentation/components";
import { formatUtcInstant } from "@/shared/presentation/format";

export const dynamic = "force-dynamic";

interface PageProps {
  readonly params: Promise<{ readonly agentId: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { agentId } = await params;
  try {
    const application = await getApplicationContainer();
    const details = await application.agents.get.execute(agentId);
    return { title: details.profile.name };
  } catch {
    return { title: "Agent not found" };
  }
}

export default async function AgentDetailPage({ params }: PageProps) {
  const { agentId } = await params;
  let details;
  try {
    const application = await getApplicationContainer();
    details = await application.agents.get.execute(agentId);
  } catch (error: unknown) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }
  const latest = details.revisions[0];
  if (latest === undefined) notFound();
  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
            Agent profile
          </p>
          <h1 className="text-3xl font-black">{details.profile.name}</h1>
          <p className="mt-2 max-w-3xl text-[var(--text-muted)]">
            {details.profile.description || "No description provided."}
          </p>
        </div>
        <AppLink href="/agents" variant="secondary">
          Back to agents
        </AppLink>
      </div>
      <Card className="grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">Latest definition</h2>
            <p className="text-sm text-[var(--text-muted)]">
              Immutable revision {latest.revisionNumber} · {formatUtcInstant(latest.createdAt)} UTC
            </p>
          </div>
          <Badge tone="success">{latest.contentScanStatus}</Badge>
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">
            System prompt
          </h3>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--surface-strong)] p-4 font-sans text-sm">
            {latest.systemPrompt}
          </pre>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge>{latest.tools.length} tools</Badge>
          <Badge>{latest.permissions.length} permissions</Badge>
          <Badge>{latest.fingerprint.slice(0, 19)}…</Badge>
        </div>
        <div className="border-t pt-5">
          <h3 className="font-bold">Queue a foundation audit</h3>
          <p className="mb-4 mt-1 text-sm text-[var(--text-muted)]">
            The run is persisted as queued. The complete audit engine, findings, and scorecards are
            intentionally not implemented yet.
          </p>
          <QueueAuditButton agentId={details.profile.id} agentRevisionId={latest.id} />
        </div>
      </Card>
      <section className="grid gap-4" aria-labelledby="revision-history">
        <h2 className="text-xl font-bold" id="revision-history">
          Revision history
        </h2>
        {details.revisions.length === 0 ? (
          <EmptyState description="No revisions are available." title="No revision history" />
        ) : (
          <ol className="grid gap-3">
            {details.revisions.map((revision) => (
              <li
                className="surface-card flex flex-wrap items-center justify-between gap-3 p-4"
                key={revision.id}
              >
                <span>
                  <strong>Revision {revision.revisionNumber}</strong>
                  <span className="ml-3 text-sm text-[var(--text-muted)]">
                    {formatUtcInstant(revision.createdAt)} UTC
                  </span>
                </span>
                <span className="font-mono text-xs text-[var(--text-muted)]">
                  {revision.fingerprint.slice(0, 27)}…
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
