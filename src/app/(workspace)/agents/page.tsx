import type { Metadata } from "next";
import Link from "next/link";

import { getApplicationContainer } from "@/bootstrap";
import { AppLink, Badge, Card, EmptyState, ErrorState } from "@/shared/presentation/components";
import { formatUtcInstant } from "@/shared/presentation/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agents" };

export default async function AgentsPage() {
  let page;
  try {
    const application = await getApplicationContainer();
    page = await application.agents.list.execute(100);
  } catch {
    return (
      <ErrorState description="Agent definitions could not be read from the local database." />
    );
  }
  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">Catalog</p>
          <h1 className="text-3xl font-black">Agents</h1>
          <p className="mt-2 max-w-3xl text-[var(--text-muted)]">
            Versioned definitions with declarative tools, permissions, and operational controls.
          </p>
        </div>
        <AppLink href="/agents/new">Create agent</AppLink>
      </div>
      {page.items.length === 0 ? (
        <EmptyState
          actionHref="/agents/new"
          actionLabel="Create an agent"
          description="Create a definition or load the deterministic seed examples."
          title="No agents found"
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {page.items.map((item) => (
            <Card className="grid gap-4" key={item.profile.id}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-xl font-bold">
                  <Link href={`/agents/${item.profile.id}`}>{item.profile.name}</Link>
                </h2>
                <Badge>Revision {item.latestRevisionNumber}</Badge>
              </div>
              <p className="text-[var(--text-muted)]">
                {item.profile.description || "No description provided."}
              </p>
              <div className="flex flex-wrap justify-between gap-3 text-xs text-[var(--text-muted)]">
                <span>Updated {formatUtcInstant(item.profile.updatedAt)} UTC</span>
                <span className="font-mono">{item.latestRevisionFingerprint.slice(0, 21)}…</span>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
