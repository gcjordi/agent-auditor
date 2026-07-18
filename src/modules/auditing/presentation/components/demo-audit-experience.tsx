"use client";

import { type RefObject, useEffect, useRef, useState } from "react";

import type { SecurityDimension, Severity } from "@/modules/auditing/domain";
import {
  DEMO_AUDIT_REPORT,
  type DemoAuditReport,
  type DemoTestOutcome,
} from "@/modules/auditing/presentation/demo-audit-fixture";
import { Alert, AppLink, Badge, Button, Card } from "@/shared/presentation/components";

const PROGRESS_STAGES = [
  "Inspecting instructions and declared permissions",
  "Running eight deterministic behavior tests",
  "Correlating synthetic evidence and findings",
  "Calculating scores and recommended guardrails",
] as const;

const STAGE_DELAY_MS = 450;

const DIMENSION_LABELS: Readonly<Record<SecurityDimension, string>> = {
  DATA_HANDLING: "Data handling",
  INSTRUCTION_INTEGRITY: "Instruction integrity",
  OPERATIONAL_CONTROL: "Operational control",
  PERMISSION_CONTROL: "Permission control",
  TOOL_SAFETY: "Tool safety",
};

type BadgeTone = "danger" | "neutral" | "success" | "warning";

function outcomeTone(outcome: DemoTestOutcome): BadgeTone {
  if (outcome === "PASS") return "success";
  if (outcome === "WARNING") return "warning";
  return "danger";
}

function severityTone(severity: Severity): BadgeTone {
  if (severity === "CRITICAL" || severity === "HIGH") return "danger";
  if (severity === "MEDIUM") return "warning";
  return "neutral";
}

export function DemoAuditExperience() {
  const [completedStageCount, setCompletedStageCount] = useState(0);
  const reportHeadingRef = useRef<HTMLHeadingElement>(null);
  const complete = completedStageCount === PROGRESS_STAGES.length;

  useEffect(() => {
    if (complete) {
      reportHeadingRef.current?.focus();
      return;
    }

    const timer = window.setTimeout(() => {
      setCompletedStageCount((current) => Math.min(current + 1, PROGRESS_STAGES.length));
    }, STAGE_DELAY_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [complete, completedStageCount]);

  if (complete) {
    return (
      <DemoReport
        headingRef={reportHeadingRef}
        onRunAgain={() => {
          setCompletedStageCount(0);
        }}
        report={DEMO_AUDIT_REPORT}
      />
    );
  }

  const activeStage = PROGRESS_STAGES[completedStageCount] ?? "Finalizing report";
  const progress = Math.round((completedStageCount / PROGRESS_STAGES.length) * 100);

  return (
    <div className="mx-auto grid max-w-3xl gap-7 py-5">
      <header className="grid justify-items-start gap-4">
        <Badge tone="success">Deterministic Demo Mode</Badge>
        <h1 className="text-4xl font-black tracking-[-0.03em] sm:text-5xl">
          Running behavioral security audit
        </h1>
        <p className="max-w-2xl text-lg leading-8 text-[var(--text-muted)]">
          Testing the Support Desk Agent inside a closed synthetic environment. No external service,
          API key, or real tool is involved.
        </p>
      </header>

      <Card className="grid gap-6">
        <div aria-busy="true" aria-live="polite" className="grid gap-3" role="status">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-bold">Audit in progress</h2>
            <span className="font-mono text-sm font-bold text-[var(--accent)]">{progress}%</span>
          </div>
          <p className="text-sm text-[var(--text-muted)]">{activeStage}</p>
          <progress
            aria-label="Demo audit progress"
            className="h-2 w-full accent-[var(--accent)]"
            max={100}
            value={progress}
          />
        </div>

        <ol className="grid gap-3">
          {PROGRESS_STAGES.map((stage, index) => {
            const completed = index < completedStageCount;
            const active = index === completedStageCount;
            return (
              <li
                className={`flex items-center gap-3 rounded-lg border p-3 text-sm ${
                  active ? "bg-[var(--accent-soft)]" : "bg-[var(--surface)]"
                }`}
                key={stage}
              >
                <span
                  aria-hidden="true"
                  className={`grid size-7 shrink-0 place-items-center rounded-full font-bold ${
                    completed
                      ? "bg-[var(--success)] text-white"
                      : active
                        ? "animate-pulse bg-[var(--accent)] text-white"
                        : "bg-[var(--surface-strong)] text-[var(--text-muted)]"
                  }`}
                >
                  {completed ? "✓" : index + 1}
                </span>
                <span
                  className={completed || active ? "font-semibold" : "text-[var(--text-muted)]"}
                >
                  {stage}
                </span>
              </li>
            );
          })}
        </ol>
      </Card>

      <Alert>
        This bounded simulation always completes with the same versioned tests, observations, and
        report.
      </Alert>
    </div>
  );
}

function DemoReport({
  headingRef,
  onRunAgain,
  report,
}: {
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly onRunAgain: () => void;
  readonly report: DemoAuditReport;
}) {
  const passCount = report.tests.filter((test) => test.outcome === "PASS").length;
  const failCount = report.tests.filter((test) => test.outcome === "FAIL").length;
  const warningCount = report.tests.filter((test) => test.outcome === "WARNING").length;

  return (
    <div className="grid gap-10">
      <header className="grid gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone="success">Audit complete</Badge>
          <span className="text-sm text-[var(--text-muted)]">
            {report.fixtureVersion} · {report.id}
          </span>
        </div>
        <div>
          <h1
            className="text-4xl font-black tracking-[-0.03em] sm:text-5xl"
            ref={headingRef}
            tabIndex={-1}
          >
            Complete audit report
          </h1>
          <p className="mt-3 text-lg text-[var(--text-muted)]">
            {report.agentName} · {report.agentRevision}
          </p>
        </div>
        <Alert tone="warning">
          These are deterministic observations from a synthetic demonstration, not a security
          certification or a test of a live system.
        </Alert>
      </header>

      <section aria-labelledby="overview-title" className="grid gap-5">
        <h2 className="text-2xl font-black" id="overview-title">
          Security overview
        </h2>
        <div className="grid gap-5 lg:grid-cols-[0.65fr_1.35fr]">
          <Card className="grid content-center justify-items-center gap-3 text-center">
            <p className="text-sm font-bold uppercase tracking-wide text-[var(--text-muted)]">
              Overall score
            </p>
            <p className="text-7xl font-black tracking-[-0.06em] text-[var(--accent)]">
              {report.overallScore}
            </p>
            <p className="font-semibold text-[var(--text-muted)]">out of 100</p>
            <Badge tone="danger">{report.overallRisk} risk</Badge>
          </Card>
          <Card className="grid content-start gap-5">
            <div>
              <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
                Executive summary
              </p>
              <p className="mt-3 text-lg leading-8">{report.summary}</p>
            </div>
            <dl className="grid gap-3 sm:grid-cols-3">
              <SummaryMetric label="Tests passed" value={`${passCount}/${report.tests.length}`} />
              <SummaryMetric label="Failed tests" value={String(failCount)} />
              <SummaryMetric label="Warnings" value={String(warningCount)} />
            </dl>
          </Card>
        </div>
      </section>

      <section aria-labelledby="category-scores-title" className="grid gap-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
            Scorecard
          </p>
          <h2 className="text-2xl font-black" id="category-scores-title">
            Category scores
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {report.categoryScores.map((category) => (
            <Card className="grid gap-3" key={category.dimension}>
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-bold">{DIMENSION_LABELS[category.dimension]}</h3>
                <strong className="text-xl text-[var(--accent)]">{category.score}</strong>
              </div>
              <progress
                aria-label={`${DIMENSION_LABELS[category.dimension]} score`}
                className="h-2 w-full accent-[var(--accent)]"
                max={100}
                value={category.score}
              />
              <p className="text-xs text-[var(--text-muted)]">Score out of 100</p>
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="tests-title" className="grid gap-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
            Deterministic suite
          </p>
          <h2 className="text-2xl font-black" id="tests-title">
            Behavioral tests
          </h2>
        </div>
        <Card className="overflow-x-auto p-0">
          <table className="w-full min-w-[48rem] border-collapse text-left text-sm">
            <caption className="sr-only">Results for eight deterministic behavior tests</caption>
            <thead className="bg-[var(--surface-strong)] text-[var(--text-muted)]">
              <tr>
                <th className="px-5 py-3 font-bold" scope="col">
                  Result
                </th>
                <th className="px-5 py-3 font-bold" scope="col">
                  Test
                </th>
                <th className="px-5 py-3 font-bold" scope="col">
                  Category
                </th>
                <th className="px-5 py-3 font-bold" scope="col">
                  Observation
                </th>
              </tr>
            </thead>
            <tbody>
              {report.tests.map((test) => (
                <tr className="border-t align-top" key={test.key}>
                  <td className="px-5 py-4">
                    <Badge tone={outcomeTone(test.outcome)}>{test.outcome}</Badge>
                  </td>
                  <th className="px-5 py-4 font-semibold" scope="row">
                    {test.title}
                    <span className="mt-1 block font-mono text-xs font-normal text-[var(--text-muted)]">
                      {test.key}
                    </span>
                  </th>
                  <td className="px-5 py-4">{DIMENSION_LABELS[test.dimension]}</td>
                  <td className="max-w-md px-5 py-4 text-[var(--text-muted)]">
                    {test.observation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

      <section aria-labelledby="findings-title" className="grid gap-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
            Evidence-backed risk
          </p>
          <h2 className="text-2xl font-black" id="findings-title">
            Findings
          </h2>
        </div>
        <div className="grid gap-5">
          {report.findings.map((finding) => (
            <Card className="grid gap-5" key={finding.id}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <Badge tone={severityTone(finding.severity)}>{finding.severity}</Badge>
                    <span className="font-mono text-xs text-[var(--text-muted)]">{finding.id}</span>
                  </div>
                  <h3 className="text-xl font-bold">{finding.title}</h3>
                  <p className="mt-2 leading-7 text-[var(--text-muted)]">{finding.summary}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-bold">{DIMENSION_LABELS[finding.dimension]}</p>
                  <p className="text-[var(--text-muted)]">{finding.confidence} confidence</p>
                </div>
              </div>

              <div className="rounded-lg bg-[var(--surface-strong)] p-4">
                <h4 className="font-bold">Potential impact</h4>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">{finding.impact}</p>
              </div>

              {finding.evidence.map((evidence) => (
                <div className="grid gap-4 rounded-xl border p-5" key={evidence.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="font-bold">Evidence {evidence.id}</h4>
                    <span className="text-xs text-[var(--text-muted)]">{evidence.traceStep}</span>
                  </div>
                  <blockquote className="border-l-4 border-l-[var(--accent)] pl-4 text-sm italic leading-6">
                    “{evidence.excerpt}”
                  </blockquote>
                  <dl className="grid gap-4 text-sm md:grid-cols-2">
                    <div>
                      <dt className="font-bold text-[var(--danger)]">Observed</dt>
                      <dd className="mt-1 leading-6 text-[var(--text-muted)]">
                        {evidence.observed}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-bold text-[var(--success)]">Expected</dt>
                      <dd className="mt-1 leading-6 text-[var(--text-muted)]">
                        {evidence.expected}
                      </dd>
                    </div>
                  </dl>
                  <p className="font-mono text-xs text-[var(--text-muted)]">
                    Source: {evidence.sourceTestKey}
                  </p>
                </div>
              ))}
            </Card>
          ))}
        </div>
      </section>

      <section aria-labelledby="guardrails-title" className="grid gap-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-wide text-[var(--accent)]">
            Action plan
          </p>
          <h2 className="text-2xl font-black" id="guardrails-title">
            Recommended guardrails
          </h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {report.guardrails.map((guardrail) => (
            <Card className="grid content-start gap-4" key={guardrail.priority}>
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-[var(--accent)] font-black text-white"
                >
                  {guardrail.priority}
                </span>
                <div>
                  <h3 className="text-lg font-bold">{guardrail.title}</h3>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">
                    Addresses {guardrail.linkedFindingIds.join(", ")}
                  </p>
                </div>
              </div>
              <div>
                <h4 className="text-sm font-bold">Proposed change</h4>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                  {guardrail.change}
                </p>
              </div>
              <div>
                <h4 className="text-sm font-bold">Expected effect</h4>
                <p className="mt-1 text-sm leading-6 text-[var(--text-muted)]">
                  {guardrail.expectedEffect}
                </p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Card className="flex flex-wrap items-center justify-between gap-5 bg-[var(--accent-soft)]">
        <div>
          <h2 className="text-xl font-bold">Run the audit again</h2>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            The same fixture always produces the same tests, evidence, findings, and score.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button onClick={onRunAgain}>Run audit again</Button>
          <AppLink href="/" variant="secondary">
            Reset demo
          </AppLink>
        </div>
      </Card>
    </div>
  );
}

function SummaryMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-lg bg-[var(--surface-strong)] p-4">
      <dt className="text-xs font-bold uppercase tracking-wide text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="mt-1 text-2xl font-black">{value}</dd>
    </div>
  );
}
