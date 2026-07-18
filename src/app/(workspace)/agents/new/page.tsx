import type { Metadata } from "next";

import { AgentCreationForm } from "@/modules/agent-catalog/presentation/components/agent-creation-form";
import { AppLink } from "@/shared/presentation/components";

export const metadata: Metadata = { title: "Create agent" };

export default function NewAgentPage() {
  return (
    <div className="grid gap-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-2">
          <p className="text-sm font-bold uppercase tracking-[0.14em] text-[var(--accent)]">
            Agent catalog
          </p>
          <h1 className="text-3xl font-black tracking-tight">Create an agent definition</h1>
          <p className="max-w-3xl text-[var(--text-muted)]">
            Store an immutable, versioned definition using declarative simulated tools and explicit
            permissions.
          </p>
        </div>
        <AppLink href="/agents" variant="secondary">
          Back to agents
        </AppLink>
      </div>
      <AgentCreationForm />
    </div>
  );
}
