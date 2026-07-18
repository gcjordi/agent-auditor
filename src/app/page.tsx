import type { Metadata } from "next";

import { AppLink, Badge, Card } from "@/shared/presentation/components";

export const metadata: Metadata = { title: "Agent Auditor" };

const auditSteps = [
  {
    description:
      "Inspect the trusted prompt, declared permissions, simulated tools, and operational controls.",
    number: "01",
    title: "Map the attack surface",
  },
  {
    description:
      "Exercise eight fixed behavior tests against a closed synthetic Support Desk Agent.",
    number: "02",
    title: "Run deterministic tests",
  },
  {
    description:
      "Review category scores, evidence-backed findings, and concrete recommended guardrails.",
    number: "03",
    title: "Get an actionable report",
  },
] as const;

export default function HomePage() {
  return (
    <div className="grid gap-16 py-5">
      <section className="grid items-center gap-10 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="grid justify-items-start gap-6">
          <Badge tone="success">Hackathon Demo · Ready now</Badge>
          <h1 className="max-w-4xl text-5xl font-black tracking-[-0.045em] sm:text-7xl">
            See how an AI agent fails—and how to fix it.
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-[var(--text-muted)] sm:text-xl">
            Run a complete behavioral security audit against a synthetic agent. In seconds, Agent
            Auditor turns observed behavior into scores, evidence, findings, and recommended
            guardrails.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <AppLink className="px-6 py-3 text-base" href="/audits/demo">
              Run Demo Audit
            </AppLink>
            <span className="text-sm text-[var(--text-muted)]">
              Deterministic · Keyless · No external calls
            </span>
          </div>
        </div>

        <Card className="grid gap-6 border-t-4 border-t-[var(--accent)]">
          <div>
            <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
              Demo target
            </p>
            <h2 className="mt-2 text-2xl font-black">Support Desk Agent</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
              A synthetic tool-using agent with customer record access, ticket updates, knowledge
              retrieval, and a confirmation-gated credit action.
            </p>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="rounded-lg bg-[var(--surface-strong)] p-4">
              <dt className="font-bold text-[var(--text-muted)]">Behavior tests</dt>
              <dd className="mt-1 text-2xl font-black">8</dd>
            </div>
            <div className="rounded-lg bg-[var(--surface-strong)] p-4">
              <dt className="font-bold text-[var(--text-muted)]">Risk categories</dt>
              <dd className="mt-1 text-2xl font-black">5</dd>
            </div>
            <div className="rounded-lg bg-[var(--surface-strong)] p-4">
              <dt className="font-bold text-[var(--text-muted)]">Environment</dt>
              <dd className="mt-1 font-bold">Closed simulation</dd>
            </div>
            <div className="rounded-lg bg-[var(--surface-strong)] p-4">
              <dt className="font-bold text-[var(--text-muted)]">Output</dt>
              <dd className="mt-1 font-bold">Complete report</dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Badge tone="success">No API key</Badge>
            <Badge>Static fixture v1.0.0</Badge>
            <Badge>Repeatable</Badge>
          </div>
        </Card>
      </section>

      <section aria-labelledby="how-it-works-title" className="grid gap-6">
        <div className="max-w-2xl">
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
            One focused journey
          </p>
          <h2 className="mt-2 text-3xl font-black" id="how-it-works-title">
            From agent definition to defensible action
          </h2>
        </div>
        <ol className="grid gap-5 md:grid-cols-3">
          {auditSteps.map((step) => (
            <li className="surface-card grid content-start gap-4 p-6" key={step.number}>
              <span className="font-mono text-sm font-black text-[var(--accent)]">
                {step.number}
              </span>
              <h3 className="text-xl font-bold">{step.title}</h3>
              <p className="text-sm leading-6 text-[var(--text-muted)]">{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="surface-card flex flex-wrap items-center justify-between gap-6 bg-[var(--accent-soft)] p-7">
        <div>
          <h2 className="text-2xl font-black">Ready to inspect the evidence?</h2>
          <p className="mt-2 text-[var(--text-muted)]">
            The complete judge flow works without storage, configuration, or outbound provider
            access.
          </p>
        </div>
        <AppLink className="px-6" href="/audits/demo">
          Run Demo Audit
        </AppLink>
      </section>
    </div>
  );
}
