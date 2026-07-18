# Testing Strategy and Commands

Agent Auditor uses a risk-based test pyramid. The highest test density belongs
to framework-independent domain policies, application orchestration, persistence
mappers, and trust boundaries. Automated checks are deterministic, keyless, and
free of live provider calls.

## Test groups

| Group         | Primary purpose                                                                                                    | Dependencies                                             |
| ------------- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Unit          | IDs, canonicalization, fingerprints, value objects, invariants, state transitions, scoring/remediation foundations | Pure functions and in-memory builders                    |
| Application   | Use cases, idempotency, deletion conflicts, cancellation, reconciliation, provider-unavailable behavior            | Fakes for repositories, clocks, IDs, jobs, and providers |
| Integration   | Prisma mappings, committed migrations, constraints, transactions, leases, cascades, immutable artifacts            | Isolated real SQLite files                               |
| Contract      | Request parsing, response DTOs, problem envelopes, Demo/fake/provider normalized results                           | Boundary schemas and synthetic fixtures                  |
| Architecture  | Dependency direction, public module APIs, environment isolation, forbidden execution imports                       | Static source inspection                                 |
| Security      | Redaction, hostile input, URL policy, size limits, safe errors, public-config secrecy                              | Synthetic canaries only                                  |
| Accessibility | Owned component foundation; page/journey checks arrive with the corresponding interaction milestones               | Testing Library and axe-compatible checks                |
| End to end    | Keyless browser smoke path through the real application and temporary database                                     | Playwright and a local production/development server     |

Tests should assert behavior rather than implementation details. Broad visual
snapshots do not replace invariant, contract, keyboard, or accessibility tests.

## Commands

```shell
pnpm test                 # ordinary Vitest suites
pnpm test:unit            # domain and focused unit suites
pnpm test:application     # use cases with deterministic fakes
pnpm test:integration     # real temporary SQLite and migration suites
pnpm test:contract        # HTTP and provider boundary contracts
pnpm test:architecture    # layer and forbidden-import rules
pnpm test:security        # misuse and secret-boundary tests
pnpm test:accessibility   # owned-component axe checks
pnpm test:e2e             # Playwright keyless smoke path
pnpm test:coverage        # coverage report and thresholds
pnpm verify               # authoritative non-browser local quality sequence
```

`pnpm test` aggregates all non-browser Vitest directories; focused scripts are
available for each required boundary. CI runs the scripts declared in
`package.json`; that file is authoritative.

## Keyless provider policy

- Do not set `OPENAI_API_KEY` for automated checks.
- Use the deterministic Demo provider or a fake model client.
- Provider adapter tests consume synthetic normalized fixtures and malformed
  response cases; they do not issue network requests.
- A missing Live configuration is an expected, tested result, not a reason to
  skip a suite or silently switch modes.
- If a future release claims Live support, its live smoke test remains manual,
  opt-in, and separate from CI.

## Database isolation

Integration and browser tests must create unique temporary SQLite databases,
apply the actual committed migration path, and remove or abandon only those
resolved temporary files. They must never reset or reuse the developer's normal
database.

Each persistence test should own its lifecycle:

1. allocate a unique temporary directory;
2. set an injected test configuration for that database;
3. apply committed migrations;
4. exercise the repository or transaction behavior;
5. close Prisma/database handles; and
6. remove the resolved temporary directory where the platform permits it.

Do not mutate global `process.env` across concurrently running tests. Prefer
configuration factories and injected clocks/ID generators.

## Browser tests

The smoke path is intentionally synthetic:

1. load the home page;
2. navigate to agent creation;
3. create a minimal valid agent and immutable first revision;
4. open the created profile;
5. queue a Demo audit when the UI supports that path; and
6. verify the run displays a queued/foundation state with no fabricated
   findings or scores.

Install the configured browser once if needed:

```shell
pnpm exec playwright install chromium
pnpm test:e2e
```

On Linux CI, Playwright may use `--with-deps` to install system libraries. If
browser binaries cannot be installed or executed locally, record the exact
failure; do not report the suite as passed.

## Coverage

The foundation aims for at least 90% branch coverage in critical domain and
application modules and at least 80% overall where meaningful. Coverage is a
signal, not a substitute for direct tests of:

- domain invariants and impossible transitions;
- deterministic serialization and fingerprints;
- immutable revision/artifact semantics;
- database constraints and recovery;
- secret/configuration boundaries; and
- forbidden target-execution capabilities.

Do not exclude critical code or add assertion-free tests merely to increase a
percentage.

## Adding a test

- Place reusable synthetic builders in `tests/fixtures`, not application source.
- Use fixed clocks and deterministic ID generators where ordering matters.
- Name the expected policy or contract in the test title.
- Assert both the returned result and absence of prohibited side effects when
  testing security paths.
- For every defect, prefer a failing regression test before the fix.
- Keep test secrets unmistakably fake and verify that redaction removes them.

## CI relationship

The primary Ubuntu 24.04 job installs from the frozen lockfile, generates and
validates Prisma, migrates a clean SQLite database, runs static checks and test
suites, builds the production application, and runs the keyless browser smoke
test. It also rejects tracked local environment and SQLite artifacts before the
build. A lighter Windows Server 2025 job checks install/generation, strict types,
unit behavior, and production build portability. Neither job has a deploy stage
or repository-secret dependency.
