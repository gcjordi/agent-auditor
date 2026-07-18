# Release Checklist

Agent Auditor is pre-release. Use this checklist for a release candidate only;
completing it does not certify the security of Agent Auditor or any audited
agent.

## 1. Scope and repository state

- [ ] The release scope matches a completed roadmap milestone.
- [ ] User-visible changes and known limitations are in `CHANGELOG.md`.
- [ ] `README.md`, API reference, setup, testing, database, threat model, and
      ADRs match actual behavior.
- [ ] Future features are not described as working.
- [ ] The working tree contains only intentional source, migration, test, and
      documentation changes.
- [ ] No runtime database, environment file, generated report, coverage output,
      or Playwright artifact is tracked.

## 2. Clean-room and licensing review

- [ ] Application code, fixtures, prompts, taxonomies, scoring, and documentation
      are original or clearly attributed under compatible terms.
- [ ] Synthetic examples contain no personal, customer, confidential, or
      proprietary information.
- [ ] The dependency license review has no known incompatible dependency.
- [ ] `LICENSE` contains the unmodified Apache License 2.0 text.
- [ ] Copyright notices use `Copyright 2026 Jordi Garcia Castillón`.

Run `pnpm licenses:check` to validate the installed production dependency graph
against the repository allow-list and print its license inventory. Review the
direct and transitive summary and record any required attribution before
marking the license item complete.

## 3. Security review

- [ ] Search for hard-coded credentials, bearer tokens, private-key delimiters,
      environment files, and suspicious generated artifacts.
- [ ] Search for forbidden target-execution imports and dynamic behavior.
- [ ] `pnpm guard:repository` passes locally, and the pinned Gitleaks history
      scan plus OSV lockfile scan pass in CI.
- [ ] Public configuration contains no secret value or raw environment data.
- [ ] Production error responses contain no stack trace, prompt, evidence,
      provider body, or internal exception text.
- [ ] Mutation routes preserve JSON-only, size, Host, Origin, nonce, and
      idempotency controls.
- [ ] CSP and secure default response headers are present in the production
      build.
- [ ] Redaction canary and malicious-input tests pass.
- [ ] The threat model reflects any new trust boundary.

## 4. Database and migration review

- [ ] Prisma client generation and schema validation pass.
- [ ] The complete committed migration path applies to a fresh SQLite database.
- [ ] Foreign-key, uniqueness, index, cascade/restrict, immutability, and lease
      integration tests pass.
- [ ] Deterministic seed data can run repeatedly.
- [ ] Upgrade and backup expectations are documented for users with existing
      local data.

## 5. Reproducible quality run

Run from a clean checkout with no `OPENAI_API_KEY`:

```shell
corepack enable
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
pnpm db:migrate:deploy
pnpm verify
pnpm build
pnpm test:e2e
```

- [ ] Record the exact Node.js and pnpm versions.
- [ ] Every command above passes without network access after dependency and
      browser installation.
- [ ] The production build starts on loopback with an isolated SQLite database.
- [ ] The keyless Demo smoke path passes and displays no fabricated result.
- [ ] The primary Linux and lightweight Windows CI jobs pass.
- [ ] Failure artifacts, if retained, contain only safe synthetic data.

## 6. Accessibility and manual behavior

- [ ] Keyboard-only navigation reaches skip link, navigation, forms, dialogs,
      errors, and primary actions in a logical order.
- [ ] Focus is visible and restored after confirmation/cancellation patterns.
- [ ] Automated axe-compatible checks pass.
- [ ] A screen-reader smoke check covers the home and agent workflow.
- [ ] Narrow viewport and 200% zoom preserve content and controls.
- [ ] Reduced-motion preferences are respected.
- [ ] Loading, empty, missing, validation, conflict, and unexpected-error states
      are understandable without color alone.

## 7. Mode and claim review

- [ ] Demo Mode works without a key and makes no outbound provider request.
- [ ] The UI and documentation do not claim certification, guaranteed safety,
      or audit completion when the engine has not produced persisted evidence.
- [ ] Live Mode is described as disabled/unconfigured unless its complete
      milestone has been implemented and separately validated.
- [ ] No silent Live-to-Demo or model fallback exists.

For the current engineering foundation, skip live-provider execution and record
that Live Mode is not a shipped operational path. A later release that claims
Live support requires a separately authorized, manual smoke result using a
designated test account; that secret must never enter CI or release artifacts.

## 8. Release administration

- [ ] Version and changelog links are updated only after all gates pass.
- [ ] The release commit/tag is reviewed and signed according to maintainer
      policy.
- [ ] No deploy, release, or tag is created by ordinary CI.
- [ ] Release notes repeat material privacy, plaintext SQLite, and feature
      limitations.
- [ ] A post-release verification issue is prepared for any explicitly accepted
      non-blocking limitation.
