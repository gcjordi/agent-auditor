# Contributing to Agent Auditor

Thank you for helping improve Agent Auditor. Contributions should preserve the
project's local-first, side-effect-free safety boundary and keep the repository
usable without an API key.

## Before you start

1. Read the [project plan](docs/PROJECT_PLAN.md),
   [architecture](docs/ARCHITECTURE.md), and
   [threat model](docs/security/THREAT_MODEL.md).
2. Search existing issues and pull requests to avoid duplicate work.
3. Discuss large product, schema, trust-boundary, or dependency-direction
   changes before implementing them.
4. Never include real secrets, confidential prompts, customer data, or
   proprietary assessment material in code, fixtures, issues, or tests.

Security vulnerabilities should not be reported in a public issue. Follow
[SECURITY.md](SECURITY.md).

## Local setup

Use Node.js 24.18.0 and the pnpm version declared by `packageManager` in
`package.json` (currently 11.14.0).

```shell
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

No API key is required. Demo Mode and every required quality check must remain
keyless. See [Development setup](docs/development/SETUP.md) for environment and
platform details.

## Branches and commits

- Branch from the current default branch and keep the branch focused on one
  coherent change.
- Use short, descriptive branch names such as `fix/revision-conflict` or
  `docs/job-lifecycle`.
- Write imperative commit subjects that explain the outcome. Conventional
  Commits are welcome but are not enforced.
- Avoid mixing mechanical formatting, dependency updates, and behavior changes
  in one commit when they can be reviewed independently.
- Do not rewrite published migration history. Add a new migration.

## Architecture boundaries

The application is a modular monolith with Domain, Application,
Infrastructure, and Presentation layers inside each business module.

- Domain code may use only framework-independent TypeScript and the small shared
  domain kernel. It must not import Next.js, React, Prisma, Zod boundary
  schemas, the OpenAI SDK, HTTP concepts, or environment access.
- Application code coordinates domain objects through narrow ports. It must not
  query Prisma or format UI responses directly.
- Infrastructure implements application ports and maps persistence/provider
  records explicitly. Provider SDK types must remain at this edge.
- Presentation invokes application-facing contracts. React components and route
  handlers must not contain business policy or direct Prisma calls.
- Modules may consume another module only through its intentional public API;
  do not deep-import another module's infrastructure.
- `src/bootstrap` is the manual composition root. Do not introduce a service
  locator or dependency-injection framework.

Architecture tests enforce critical rules. New exceptions require evidence, an
ADR, and review; a path-alias workaround is not an exception.

## Security requirements

- All target tools remain declarative and simulated. Do not add shell,
  filesystem, browser, arbitrary network, dynamic import, or code-evaluation
  execution paths for target-controlled input.
- Parse all untrusted input at the boundary and enforce domain invariants after
  parsing.
- Keep API keys and environment secrets server-only. Never log prompts, raw
  evidence, raw tool arguments, authorization headers, or provider bodies.
- Preserve JSON-only, same-origin, host/origin, nonce, size-limit, and
  idempotency protections on mutation routes.
- Render agent and provider content as hostile text. Do not introduce raw HTML
  rendering without a separate threat review.
- Add focused misuse tests for changes at a trust boundary.

## Tests and quality gates

Add the smallest meaningful tests at the right level. Domain/application tests
should use fakes; persistence tests should use a temporary real SQLite database
and committed migrations. Automated tests must not call a live provider.

Run before opening a pull request:

```shell
pnpm verify
pnpm build
```

Run the relevant focused suites while developing:

```shell
pnpm test:unit
pnpm test:application
pnpm test:integration
pnpm test:contract
pnpm test:architecture
pnpm test:security
pnpm test:accessibility
pnpm test:e2e
```

Do not claim a check passed unless it was run successfully. If Playwright cannot
run on your platform, report the exact reason and ensure all other gates pass.
CI and `pnpm verify` are authoritative; the project intentionally has no
mandatory local Git hook.

See [Testing](docs/development/TESTING.md) for suite ownership and isolation.

## Documentation expectations

Update documentation in the same change when behavior, configuration, routes,
schemas, trust boundaries, or limitations change.

Create or amend an ADR when changing:

- architectural style or dependency direction;
- a persistence or migration contract;
- the closed simulation boundary;
- audit lifecycle or job recovery semantics;
- canonical fingerprint behavior; or
- the security/privacy boundary.

Do not describe planned features as implemented. Examples and fixtures must be
synthetic and original.

## Pull request checklist

- The change is scoped and explained.
- New behavior has meaningful tests.
- `pnpm verify` and `pnpm build` pass, or exact limitations are documented.
- Database changes include a committed migration and mapper tests.
- Security and accessibility effects were considered.
- Documentation and changelog entries match shipped behavior.
- No runtime database, environment file, generated report, browser artifact, or
  secret is committed.

By contributing, you agree that your contribution is licensed under the
repository's [Apache License 2.0](LICENSE) and that community participation is
governed by the [Code of Conduct](CODE_OF_CONDUCT.md).
