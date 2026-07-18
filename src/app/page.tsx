import type { Metadata } from "next";
import Link from "next/link";

import { getApplicationContainer, getPublicServerCapabilities } from "@/bootstrap";
import { AppLink, Badge, Card, EmptyState, ErrorState } from "@/shared/presentation/components";
import { formatUtcInstant } from "@/shared/presentation/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agent Auditor" };

export default async function HomePage() {
  const capabilities = getPublicServerCapabilities();
  let data: Awaited<ReturnType<typeof loadHomeData>> | undefined;
  try {
    data = await loadHomeData();
  } catch {
    data = undefined;
  }

  return (
    <div className="grid gap-10">
      <section className="grid items-center gap-8 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="grid gap-5">
          <Badge>Engineering foundation</Badge>
          <h1 className="max-w-4xl text-4xl font-black tracking-[-0.035em] sm:text-6xl">
            Audit agent behavior before real tools are connected.
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-[var(--text-muted)]">
            Agent Auditor stores versioned agent definitions and queues behavioral security audits
            in a closed, side-effect-free simulation architecture.
          </p>
          <div className="flex flex-wrap gap-3">
            <AppLink href="/agents/new">Create an agent</AppLink>
            <AppLink href="/agents" variant="secondary">
              Explore seeded examples
            </AppLink>
          </div>
        </div>
        <Card className="grid gap-5">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
              Operating modes
            </p>
            <h2 className="mt-2 text-2xl font-black">Local by default</h2>
          </div>
          <div className="grid gap-4">
            <div className="rounded-lg bg-[var(--accent-soft)] p-4">
              <div className="flex items-center justify-between gap-3">
                <strong>Demo Mode</strong>
                <Badge tone="success">Available</Badge>
              </div>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Deterministic and keyless. No provider or real tool calls.
              </p>
            </div>
            <div className="rounded-lg bg-[var(--surface-strong)] p-4">
              <div className="flex items-center justify-between gap-3">
                <strong>Live Mode</strong>
                <Badge tone="neutral">
                  {capabilities.liveModeConfigured ? "Disabled in foundation" : "Not configured"}
                </Badge>
              </div>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Optional and explicitly unavailable in this phase. It never falls back silently.
              </p>
            </div>
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            This tool reports observed behavior; it does not certify or guarantee security.
          </p>
        </Card>
      </section>

      <section className="grid gap-5" aria-labelledby="recent-agents-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
              Catalog
            </p>
            <h2 className="text-2xl font-black" id="recent-agents-title">
              Recent agents
            </h2>
          </div>
          <Link className="font-bold text-[var(--accent)]" href="/agents">
            View all agents
          </Link>
        </div>
        {data === undefined ? (
          <ErrorState description="The local database is unavailable. Apply migrations and seed data, then reload." />
        ) : data.agents.items.length === 0 ? (
          <EmptyState
            actionHref="/agents/new"
            actionLabel="Create your first agent"
            description="No agent definitions have been stored yet."
            title="The catalog is empty"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {data.agents.items.map((item) => (
              <Card className="grid gap-3" key={item.profile.id}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-lg font-bold">
                    <Link href={`/agents/${item.profile.id}`}>{item.profile.name}</Link>
                  </h3>
                  <Badge>Revision {item.latestRevisionNumber}</Badge>
                </div>
                <p className="line-clamp-3 text-sm text-[var(--text-muted)]">
                  {item.profile.description || "No description provided."}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  Updated {formatUtcInstant(item.profile.updatedAt)} UTC
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-5" aria-labelledby="recent-audits-title">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">Queue</p>
            <h2 className="text-2xl font-black" id="recent-audits-title">
              Recent audit runs
            </h2>
          </div>
          <Link className="font-bold text-[var(--accent)]" href="/audits">
            View all audits
          </Link>
        </div>
        {data === undefined ? null : data.audits.length === 0 ? (
          <EmptyState
            description="Audit runs appear here after a Demo audit is queued from an agent page."
            title="No audit runs yet"
          />
        ) : (
          <div className="grid gap-3">
            {data.audits.map((run) => (
              <Link
                className="surface-card flex flex-wrap items-center justify-between gap-3 p-4 no-underline"
                href={`/audits/${run.id}`}
                key={run.id}
              >
                <span>
                  <strong>{run.mode} audit</strong>
                  <span className="ml-3 text-sm text-[var(--text-muted)]">
                    {formatUtcInstant(run.createdAt)} UTC
                  </span>
                </span>
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
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

async function loadHomeData() {
  const application = await getApplicationContainer();
  const [agents, audits] = await Promise.all([
    application.agents.list.execute(6),
    application.audits.list.execute(6),
  ]);
  return { agents, audits };
}
