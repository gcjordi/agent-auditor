# Project Plan

## Document purpose

This document defines the delivery charter for the first production-quality, local-first release of Agent Auditor. It establishes scope, success criteria, requirements, milestones, risks, assumptions, quality gates, and the documentation and build strategy.

| Property             | Value                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| Status               | Approved baseline; M1/M2 foundation implemented                                                             |
| Planning horizon     | MVP and immediate post-MVP                                                                                  |
| Implementation state | Engineering, domain, persistence, API, UI-shell, and quality foundations are present; M3-M7 remain planned. |
| Source of truth      | This document governs scope; architectural detail lives in the linked design documents.                     |

## 1. Product charter

Agent Auditor will help developers understand and improve the behavioral security of an AI agent before that agent is connected to real capabilities. A user provides an agent definition consisting of a system prompt, simulated tool contracts, explicit permission grants, and declarative Operational Controls. The application builds a capability-aware test plan, runs behavioral scenarios in a side-effect-free harness, records evidence, produces findings and transparent scores, proposes guardrails, and compares a revised definition against the same locked plan.

The product promise is not that an agent is “secure.” The promise is that a user can obtain a repeatable, evidence-backed view of identified behaviors and can verify whether a proposed change improved, preserved, or regressed those behaviors.

### 1.1 Outcomes

The MVP succeeds when it can:

1. complete a useful audit without outbound external network access or an API key;
2. perform a Live GPT-5.6 audit when a valid server-side API key and requested model access are available;
3. prove that no target tool can produce a real side effect;
4. link every finding to one or more inspectable evidence records;
5. explain every score through a public, versioned formula and coverage measure;
6. turn accepted guardrails into a new immutable target revision;
7. compare baseline and verification outcomes on stable test identities; and
8. present the complete judge journey in a polished, accessible local interface.

### 1.2 Success indicators

| Indicator             | MVP acceptance target                                                                                                                                           |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offline readiness     | The bundled demonstration completes with no API key and no outbound external runtime request; browser-to-loopback HTTP remains local.                           |
| Evidence traceability | 100% of findings reference persisted, sanitized evidence and a test execution.                                                                                  |
| Tool isolation        | Automated misuse tests demonstrate that declarations cannot invoke shell, network, filesystem, dynamic code, or external tools.                                 |
| Comparison integrity  | Primary score deltas are recomputed over only the matched cases that are scorable on both sides of the same locked plan and evaluation/scoring policy versions. |
| Reproducible demo     | Repeated Demo Mode runs over the same target revision produce the same plan, outcomes, findings, and scores.                                                    |
| Secret handling       | API keys never appear in browser payloads, SQLite, evidence, error responses, or logs.                                                                          |
| Accessibility         | The complete critical path meets WCAG 2.2 AA checks and is usable by keyboard without relying on color.                                                         |
| Quality               | All required static checks, tests, migration checks, builds, and Demo Mode end-to-end tests pass in a keyless CI run.                                           |

## 2. Users and primary jobs

| User               | Primary job                                                  | Required experience                                                                         |
| ------------------ | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| AI developer       | Find unsafe instruction/tool interactions before integration | Fast setup, actionable evidence, concrete guardrail diff                                    |
| AI startup         | Establish a repeatable release check for agent behavior      | Deterministic demo, version history, comparable reruns                                      |
| Security team      | Investigate abuse paths and permission failures              | Test provenance, detailed transcripts, severity and confidence                              |
| Consultant         | Explain risk and improvement to a client                     | Clear summaries, defensible evidence, honest limitations                                    |
| AI governance team | Review controls and auditability                             | Transparent evaluation/scoring policies, immutable records, coverage and lifecycle metadata |

### 2.1 Primary journey

The core journey must fit a short demonstration without becoming a special-case mock:

1. Open the local application and choose the bundled example or create an agent.
2. Enter or review its prompt, tool schemas, permission grants, and Operational Controls.
3. Validate and save an immutable target revision.
4. choose Demo or Live mode and review the data boundary.
5. Start an audit and watch persistent phase-level progress.
6. Review the posture summary, coverage, test outcomes, findings, and linked evidence.
7. Preview guardrails as a diff, edit if needed, and explicitly create a new revision.
8. Run a verification audit using the locked baseline plan.
9. Inspect paired improvements, unchanged behavior, regressions, and any new unpaired tests.

## 3. Scope

### 3.1 MVP capabilities

- Create, edit as a new version, list, and delete local agent definitions.
- Capture an English-language system prompt, JSON-Schema-shaped tool declarations, permission grants, versioned declarative Operational Controls, and optional expected safe behavior.
- Normalize and validate definitions with explicit size and complexity limits.
- Display a capability and permission summary before an audit starts.
- Generate bounded, capability-aware test plans from deterministic rules and templates.
- Optionally augment planning and run the target through Live GPT-5.6 Mode.
- Execute all scenarios using a closed registry of synthetic tool simulators.
- Persist run progress, test outcomes, sanitized observations, evidence, findings, coverage, and scorecards.
- Support pass, warning, fail, inconclusive, error, skipped, and cancelled semantics without converting infrastructure errors into security outcomes.
- Generate prompt, tool-contract, permission, and operational guardrail proposals.
- Require user review before creating a guarded target revision.
- Re-run a locked plan and compare security behavior plus utility-preservation cases.
- Provide local data deletion and clearly disclose plaintext SQLite storage.
- Provide deterministic bundled fixtures that tell a coherent end-to-end story.

### 3.2 Explicit non-goals

The MVP will not include:

- authentication, users, teams, roles, or tenant isolation;
- payments, subscriptions, notifications, or collaboration;
- cloud deployment, containers, orchestration, or enterprise infrastructure;
- connections to remote agent endpoints;
- execution of real tools or acceptance of tool credentials;
- browser automation, shell commands, filesystem tools, or arbitrary network calls;
- automatic modification of an external agent;
- a marketplace or runtime plugin system;
- compliance certification or claims that a score proves security;
- multilingual UI; or
- hosted telemetry.

Report export, custom rule packs, external agent connectors, and multi-user governance are post-MVP candidates and must not distort the first-release architecture.

## 4. Foundational decisions and assumptions

| Topic              | Planning decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit subject      | The MVP audits an in-application definition, not a remote running agent.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Unit of history    | Each audit references one immutable target revision and stores engine, plan, evaluation-policy, scoring-policy, mode, and model metadata.                                                                                                                                                                                                                                                                                                                                                            |
| Demo Mode          | Default, deterministic, keyless, and free of outbound external runtime calls. It adapts templates to declared capabilities and labels all behavior as simulated.                                                                                                                                                                                                                                                                                                                                     |
| Live Mode          | Optional server-side OpenAI integration restricted to validated GPT-5.6 identifiers or snapshots. The requested `gpt-5.6` default, exact model access, and API compatibility must be verified at implementation kickoff.                                                                                                                                                                                                                                                                             |
| OpenAI API surface | The Responses API is the planned boundary, isolated behind an application port so API details do not enter the domain.                                                                                                                                                                                                                                                                                                                                                                               |
| Tools              | Tool schemas are untrusted data. Calls are intercepted and answered only by synthetic in-process simulators.                                                                                                                                                                                                                                                                                                                                                                                         |
| Evaluation         | Deterministic assertions are primary where possible; model-assisted judgments must be structured, validated, evidenced, and allowed to be inconclusive.                                                                                                                                                                                                                                                                                                                                              |
| Evaluation policy  | The versioned evaluation policy maps traces to outcomes, findings, severity, and confidence; it is distinct from the numeric scoring policy.                                                                                                                                                                                                                                                                                                                                                         |
| Scoring            | Higher is safer. The original formula is public and versioned. Coverage and readiness gates are displayed beside the score.                                                                                                                                                                                                                                                                                                                                                                          |
| Guardrails         | Proposals are reviewable diffs. Applying one creates a new revision and never mutates the baseline.                                                                                                                                                                                                                                                                                                                                                                                                  |
| Verification       | Primary deltas are recomputed over stable cases scorable on both sides while plan, mode, exact Live model/request profile, fixture, seed, budgets, engine, and evaluation/scoring policies are held compatible. The candidate must descend from the baseline revision; a report labeled guardrail verification targets exactly the revision applied by the baseline-origin set. New tests and non-comparable cases are shown separately. Utility cases prevent blanket refusal from appearing safer. |
| Persistence        | Prisma and SQLite, with no user or tenant tables. The database is local plaintext unless the user provides filesystem-level protection.                                                                                                                                                                                                                                                                                                                                                              |
| Runtime            | One local Node.js process, loopback binding by default, with a persisted in-process job coordinator and no external queue.                                                                                                                                                                                                                                                                                                                                                                           |
| Language           | UI, bundled test content, findings, and documentation are English only.                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Clean-room scope   | All taxonomy, templates, scoring, prompts, and implementation will be original and derived only from the requirements and artifacts created in this repository.                                                                                                                                                                                                                                                                                                                                      |
| Licensing          | Apache License 2.0; copyright notice is “Copyright 2026 Jordi Garcia Castillón.” The standard license text remains unmodified.                                                                                                                                                                                                                                                                                                                                                                       |

## 5. Functional requirements

| ID    | Requirement               | Acceptance summary                                                                                                                                                        |
| ----- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-01 | Manage target definitions | A user can create a profile and immutable revisions containing a prompt, tools, permissions, declarative Operational Controls, and safe-behavior notes.                   |
| FR-02 | Validate all boundaries   | Invalid types, excessive sizes, unsupported schemas, duplicate names, and inconsistent permissions are rejected with field-level errors.                                  |
| FR-03 | Explain the audit surface | The review step summarizes capabilities, sensitive actions, permission scope, and detected control gaps.                                                                  |
| FR-04 | Plan adaptive tests       | Test selection responds to the prompt, tools, permissions, and deterministic hypotheses while respecting budgets.                                                         |
| FR-05 | Run in Demo Mode          | A reference and user-defined target can be assessed deterministically without an API key or outbound external provider call.                                              |
| FR-06 | Run in Live Mode          | A valid server-side configuration enables model-backed planning, target responses, and bounded evaluation.                                                                |
| FR-07 | Simulate tools            | Every proposed tool call is parsed, permission-checked, recorded, and answered synthetically; unsupported calls are denied.                                               |
| FR-08 | Persist progress          | Audits expose queued, phase, case, cancellation, completion, interruption, and failure states across page refreshes.                                                      |
| FR-09 | Preserve evidence         | Findings navigate to sanitized transcript excerpts, tool attempts, assertions, and provenance without exposing hidden reasoning.                                          |
| FR-10 | Produce findings          | Findings include category, severity, confidence, description, impact, evidence, and actionable recommendation.                                                            |
| FR-11 | Score transparently       | Dimension and overall scores expose formula version, applicable weight, result counts, execution coverage, high-impact surface coverage/limitations, and readiness state. |
| FR-12 | Propose guardrails        | The system can propose prompt, tool, permission, and operating-control changes linked to findings.                                                                        |
| FR-13 | Review changes            | A user can accept, reject, or edit proposals and preview the exact new target revision.                                                                                   |
| FR-14 | Verify changes            | A verification run uses the baseline plan and presents matched deltas, regressions, unchanged cases, and new tests separately.                                            |
| FR-15 | Control local data        | A user can delete a target and its owned audit history after explicit confirmation; active runs cannot be deleted.                                                        |
| FR-16 | Disclose mode limitations | Mode, network use, model metadata, simulation status, and incomplete coverage are visible in setup and reports.                                                           |

## 6. Quality attributes

### 6.1 Security and privacy

- Bind the local server to loopback unless a future explicit configuration changes that boundary.
- Treat prompt text, tool descriptions, schemas, permission data, model output, imported JSON, and rendered evidence as hostile input.
- Render MVP prompt/evidence content as escaped plain text or application-owned code/text views; raw HTML, model-supplied links, and Markdown rendering are unsupported.
- Keep model credentials server-only and redact secret-like values from errors, evidence, and structured logs.
- Reject high-confidence credential formats in revision input and warn before saving other secret-like free text, which is retained verbatim for audit fidelity.
- Validate loopback Host/Origin, expose no permissive CORS policy, and require JSON plus a same-origin request nonce and idempotency key for state-changing routes.
- Do not implement a generic executor, dynamic import path, shell wrapper, browser driver, filesystem adapter, or arbitrary network client for target tools.
- Do not enable provider-hosted or built-in model tools; Live targets may emit only declared function-like attempts that return through the same local simulation interceptor.
- Require one-run confirmation bound to the revision fingerprint, exact model identifier, and disclosed transmission-summary digest before Live Mode transmits audit content.
- Use bounded inputs, case counts, turns, output sizes, timeouts, retries, and concurrency.
- Record evidence, not hidden chain-of-thought. Evaluator output is a concise evaluation-policy decision and citations to observations.

The current foundation enforces a 64,000-character system prompt, 32 tools,
128 permission grants, 64 KiB of canonical UTF-8 per tool schema, and a 128 KiB
HTTP mutation body. New run records default to 24 maximum cases, 12 interaction
steps, 8 tool attempts, 4,096 model-output tokens per case, and a five-minute
duration budget. The case and duration defaults are configurable within hard
bounds (1–100 cases and 30–3,600 seconds); domain constructors retain absolute
ceilings of 200 cases, 50 steps/tool attempts, and one hour so corrupted or
future inputs fail closed. The coordinator is configured for one-to-four local
workers but no worker loop runs automatically in this foundation, and Live Mode
is disabled. M3 must consolidate these values into one versioned budget policy
before execution; M6 must separately calibrate Live concurrency and cost limits.

### 6.2 Reliability and recoverability

- Persist state after every audit phase and test completion.
- Reconcile stale running records to `INTERRUPTED` on process startup; allow a user to retry from a safe boundary.
- Make start, cancel, and retry commands idempotent.
- Serialize or narrowly bound SQLite writes and keep transactions short.
- Preserve partial evidence when a run ends in error, while clearly separating it from completed results.
- Never convert timeouts, parse failures, provider errors, or missing data into passes.

### 6.3 Performance and resource use

- Provide visible UI acknowledgment within 100 ms of local interaction and persistent progress for work over one second.
- Target sub-200 ms median local reads for normal report views on the bundled dataset.
- Complete the reference Demo Mode audit in under 15 seconds on a supported developer machine.
- Keep the current five-minute default run budget configurable within the
  one-hour domain ceiling, with per-operation timeouts and cancellation. M3
  benchmarks determine whether the release default changes; the reference Demo
  still targets completion in under 15 seconds.
- Paginate or virtualize large evidence collections rather than rendering an unbounded transcript.
- Prevent model cost surprises through visible case budgets and a pre-run estimate based on configured limits, without hard-coding provider pricing.

### 6.4 Accessibility and usability

- Meet WCAG 2.2 AA for the critical journey.
- Use semantic landmarks, a logical heading structure, visible focus, keyboard-complete controls, connected labels and errors, a skip link, reduced-motion support, and polite live regions for progress.
- Never communicate severity, result, or comparison status through color alone.
- Give charts equivalent text or table representations and make diffs readable without side-by-side vision.
- Cover empty, loading, validation, missing-key, cancellation, partial, timeout, provider-error, no-finding, and regression states.

### 6.5 Maintainability and reproducibility

- Use strict TypeScript with no `any` in application code.
- Keep domain code framework-independent and enforce inward dependency direction.
- Prefer small modules, pure policies, explicit ports, constructor or factory injection, and deterministic clocks/IDs in tests.
- Version test templates, engine behavior, taxonomy, evaluation policy, scoring policy, and persisted contracts.
- Pin runtime, package manager, dependencies, and lockfile at implementation kickoff.
- Use a canonical serializer and content fingerprints for immutable revisions and test plans.

## 7. Delivery workstreams

### 7.1 Product and experience

Defines the judge journey, route information architecture, visual language, accessibility behavior, empty/error states, report hierarchy, and honest mode disclosures.

### 7.2 Domain and audit science

Owns the original taxonomy, immutable target model, test selection, execution outcomes, finding correlation, scoring policy, guardrail semantics, utility preservation, and comparison rules.

### 7.3 Platform and persistence

Owns application composition, typed HTTP contracts, Prisma repositories, SQLite migrations, job lifecycle, configuration, structured local logs, redaction, and data deletion.

### 7.4 Model integration

Owns the OpenAI adapter, request/response validation, context separation, budgets, retries, provider error mapping, and Live Mode consent. The rest of the system depends only on ports.

### 7.5 Quality and release

Owns the test pyramid, fixtures, security misuse suite, accessibility verification, CI gates, documentation, licensing, and reproducible release checks.

## 8. Required technologies

| Concern                        | Selected technology or approach                                                                                                                     |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime and package management | Active Node.js LTS, Corepack, pnpm, immutable lockfile                                                                                              |
| Web application                | Next.js App Router and React, running in the Node.js runtime                                                                                        |
| Language                       | Strict TypeScript                                                                                                                                   |
| Runtime validation             | Zod at UI, HTTP, persistence-JSON, configuration, and model-output boundaries                                                                       |
| Persistence                    | Prisma ORM and SQLite with committed migrations                                                                                                     |
| Live model integration         | Official OpenAI JavaScript SDK through the Responses API adapter                                                                                    |
| Styling                        | Tailwind CSS, semantic HTML, application-owned accessible components and design tokens                                                              |
| Forms                          | React Hook Form integrated with shared Zod input contracts                                                                                          |
| Unit and integration tests     | Vitest and Testing Library                                                                                                                          |
| End-to-end tests               | Playwright using Demo Mode only in automated runs                                                                                                   |
| Accessibility                  | Automated axe checks plus manual keyboard and screen-reader smoke tests                                                                             |
| Architecture enforcement       | TypeScript path policy plus repository-owned source-scanning architecture tests                                                                     |
| Logging                        | Pino structured local logs with allow-listed fields, redaction, and correlation IDs; no hosted telemetry                                            |
| Safe evidence rendering        | Escaped plain text and application-owned code/text viewers; Markdown is outside the MVP unless separately approved with a sanitizer                 |
| Supply-chain checks            | Offline repository/secret guard, production-license allow-list, Gitleaks history scan, and OSV lockfile scan; package-manager audit remains M7 work |
| CI                             | Platform-neutral keyless pipeline on pinned GitHub-hosted Ubuntu and Windows runners with frozen install, checks, coverage, build, and Demo E2E     |

Exact package versions remain an implementation-time compatibility decision; the chosen roles and boundaries are settled. See [Technology Decisions](TECH_DECISIONS.md).

## 9. Milestones

| Milestone                            | Outcome                                                                                             | Depends on |
| ------------------------------------ | --------------------------------------------------------------------------------------------------- | ---------- |
| M0 — Planning foundation             | Complete documentation set ready for owner review and approval                                      | None       |
| M1 — Engineering foundation          | Reproducible strict TypeScript application shell and quality pipeline                               | M0         |
| M2 — Domain and persistence          | Tested domain policies, Prisma schema, migrations, repositories, and lifecycle recovery             | M1         |
| M3 — Target workflow and Demo engine | Complete target editor plus deterministic, side-effect-free audit path                              | M2         |
| M4 — Evidence, findings, and scoring | Traceable report with original evaluation/scoring policies, coverage, and accessible evidence views | M3         |
| M5 — Guardrails and verification     | Reviewed revision creation and honest baseline-to-verification comparison                           | M4         |
| M6 — Live GPT-5.6 Mode               | Server-only OpenAI adapter with structured, bounded, observable failures                            | M3, M4     |
| M7 — Release hardening               | Security, accessibility, resilience, documentation, and judge-demo release quality                  | M5, M6     |

The detailed acceptance criteria and risk retired by each milestone are defined in [Roadmap](ROADMAP.md).

## 10. Testing strategy

The test suite will be risk-based rather than dominated by UI snapshots:

1. **Domain unit tests** cover invariants, state transitions, scoring math, readiness gates, coverage, fingerprints, deduplication, and comparison rules. Property-based tests exercise score and state-machine invariants.
2. **Application tests** run use cases with fake repositories, clocks, IDs, model gateways, simulators, and job coordinators. They verify orchestration, idempotency, cancellation, and error mapping.
3. **Repository integration tests** use a temporary real SQLite database and actual migrations to verify constraints, transactions, cascades, indexes, and interruption recovery.
4. **Adapter contract tests** validate Demo and OpenAI normalized contracts from synthetic fixtures. Automated tests never require a real API key.
5. **Presentation tests** cover forms, route contracts, hostile rendering, evidence navigation, focus behavior, and state variants.
6. **End-to-end tests** exercise the full bundled Demo journey, guardrail revision, verification comparison, deletion, and restart recovery.
7. **Security misuse tests** attempt prompt-context escape, schema exhaustion, unsupported tools, secret leakage, HTML/script rendering, unsafe links, cross-origin/Host/nonce bypass, and execution-boundary bypass.
8. **Manual release checks** cover Live Mode with a designated test key, keyboard-only navigation, screen-reader smoke testing, reduced motion, narrow viewport, and interrupted-run recovery.

The current `test:coverage` gate enforces 75% global branches and 80% functions,
lines, and statements, and `pnpm verify` runs it. Before M7 acceptance,
critical domain and application modules receive explicit 90% branch gates while
the repository remains at least 80% overall. No aggregate percentage excuses an
untested security invariant.

## 11. Build and quality pipeline

The implementation pipeline will run in this order:

1. verify pinned Node.js and package-manager versions;
2. install from the committed lockfile without mutation;
3. generate the Prisma client and validate schema formatting;
4. apply migrations to a fresh temporary SQLite database, exercise every earlier committed schema baseline when one exists, and verify drift is absent;
5. check formatting, lint rules, forbidden imports, and strict types;
6. run unit, property, application, repository, component, accessibility, and security tests;
7. create a production application build;
8. start that build against an isolated database and run Demo Mode end-to-end tests;
9. scan tracked/history content for secrets, the lockfile with OSV, and the
   installed production graph against the license allow-list; add a
   package-manager audit during M7 if it provides non-duplicative coverage; and
10. in M7, retain only sanitized coverage/failure artifacts while keeping
    database contents, environment files, prompts, and secrets out of uploads.

Merge or release is blocked by any failed stage. Live API tests are manual and opt-in so CI remains deterministic, offline-capable, and keyless.

## 12. Documentation structure

The current planning set is:

```text
README.md
docs/
├── PROJECT_PLAN.md
├── ARCHITECTURE.md
├── ROADMAP.md
├── DOMAIN_MODEL.md
├── DATABASE_DESIGN.md
└── TECH_DECISIONS.md
```

Release hardening will add only documents that have an owner and maintenance trigger:

```text
CONTRIBUTING.md                 contribution workflow and quality commands
SECURITY.md                     vulnerability reporting and supported versions
CODE_OF_CONDUCT.md              community expectations
CHANGELOG.md                    user-visible release history
docs/adr/                       numbered architecture decision records
docs/api/                       HTTP contract and error-envelope reference
docs/AUDIT_METHODOLOGY.md       public taxonomy, test, evidence, and score method
docs/security/THREAT_MODEL.md   application threat model and trust boundaries
docs/development/               setup, testing, migrations, and release guide
```

Documentation examples must use synthetic data. Architecture decisions that change persisted contracts, trust boundaries, scoring, or dependency direction require an ADR and an update to the affected design document.

## 13. Risk register

| Risk                                                         | Likelihood / impact | Mitigation and evidence of control                                                                                                                          |
| ------------------------------------------------------------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audited content injects the auditor                          | High / High         | Keep generator, target, and evaluator contexts separate; mark all target content as data; validate structured outputs; add cross-context injection tests.   |
| A simulated tool becomes an execution primitive              | Low / Critical      | Closed simulator registry, no generic executor or dynamic imports, synthetic outputs only, explicit deny path, architecture boundary tests.                 |
| Findings are hallucinated or unsupported                     | Medium / High       | Prefer deterministic assertions, require evidence links, expose confidence and inconclusive states, correlate duplicate findings, retain human review.      |
| The same model generates and judges tests                    | Medium / High       | Separate roles and prompts, deterministic checks, stable evaluation/scoring policies, utility cases, fixture calibration, and honest limitation disclosure. |
| Scores obscure severe failures or missing coverage           | Medium / High       | Show coverage and readiness separately, block readiness on critical failures, make formula public, withhold definitive score when coverage is too low.      |
| Blanket refusal games the score                              | Medium / High       | Include expected-safe utility cases and report security improvement and utility regression together.                                                        |
| Live data exposes sensitive prompt content                   | Medium / High       | Default to Demo, pre-run consent, minimize payloads, redact secrets, server-only credentials, local retention controls.                                     |
| Model access, behavior, or API shape changes                 | Medium / Medium     | Configurable model identifier, provider port, startup capability validation, normalized errors, Demo fallback chosen explicitly by user.                    |
| Unbounded tests create cost or denial of service             | Medium / High       | Central size/turn/case/time/concurrency budgets, cancellation, estimates, bounded retries, payload depth checks.                                            |
| SQLite contention or process interruption corrupts lifecycle | Medium / Medium     | Short transactions, bounded concurrency, persisted checkpoints, startup reconciliation, migration and recovery tests.                                       |
| Evidence rendering enables script or link injection          | Medium / High       | Escaped plain-text/code viewers, no model-supplied links or HTML, restrictive content security policy, and hostile-content tests.                           |
| Secrets leak through logs or evidence                        | Medium / Critical   | Structured allow-list logging, redaction at ingestion and logging, no raw provider request logging, secret-canary tests.                                    |
| Comparison claims improvement from a changed suite           | Medium / High       | Locked baseline plan, stable case keys, engine/evaluation/scoring compatibility checks, paired delta only, unpaired results separated.                      |
| Hackathon scope dilutes the core journey                     | High / Medium       | Milestone exit gates, explicit non-goals, Demo-first ordering, no speculative infrastructure.                                                               |
| Local database is mistaken for encrypted storage             | Medium / Medium     | Plain-language disclosure, filesystem guidance, deletion controls, no encryption claim.                                                                     |
| Originality or licensing is unclear                          | Low / High          | Clean-room work, original tests/evaluation/scoring/prompts, dependency license scan, exact copyright notice, and repository-only design provenance.         |

## 14. Definition of Done for the MVP

The MVP is done only when:

- all M1–M7 exit criteria are met on a clean checkout;
- the bundled Demo Mode journey is deterministic, polished, and entirely keyless;
- a manual Live Mode run succeeds with the requested model configuration or the UI clearly reports unavailable access without compromising Demo Mode;
- every result is traceable to an immutable revision, plan, engine/evaluation/scoring policy version, execution, and sanitized evidence;
- the verification report can show improvement, no change, regression, and inconclusive outcomes honestly;
- critical security boundaries have automated misuse tests;
- the primary journey passes automated and manual accessibility checks;
- the database can be migrated from empty, recovered after interruption, and deleted through supported controls;
- no user audit data, real personal-data fixture, generated database, secret, or local environment file is tracked;
- setup, architecture, security, contribution, testing, and limitation documentation matches the shipped behavior; and
- the Apache 2.0 license and 2026 copyright notice are present.

## 15. Implementation-time validation items

No product decision is intentionally left blocking. The following items require verification, not redesign, when implementation starts:

1. Select and pin mutually compatible current versions of Node.js, Next.js, React, TypeScript, Prisma, Zod, the OpenAI SDK, and test tools.
2. Confirm the exact API model identifier and account availability for the requested GPT-5.6 target; allow configuration only among validated GPT-5.6 identifiers or snapshots and fail clearly if none is available.
3. Verify the selected Prisma version's SQLite support for JSON and enum-like fields; use canonical text plus Zod and database checks where native representation is unsuitable.
4. Benchmark the initial input and run budgets against the reference fixture and adjust only through a documented decision.
5. Confirm supported desktop browsers and operating systems based on the hackathon evaluation environment; design baseline is current evergreen browsers on Windows, macOS, and Linux.
6. Keep the selected GitHub-hosted `ubuntu-24.04` and `windows-2025` CI runners
   pinned, then calibrate the original test corpus and score thresholds with
   documented synthetic fixtures; do not tune them to guarantee an impressive
   improvement.
7. Decide whether SQLite write-ahead logging improves the actual workload after repository integration tests; correctness must not depend on it.

These validations are deliberately deferred because this prompt prohibits dependency installation, framework generation, Prisma creation, and application code.
