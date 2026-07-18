# Changelog

All notable project changes are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and releases will use
[Semantic Versioning](https://semver.org/) once versioned distribution begins.

## [Unreleased]

### Added

- Strict Next.js, React, TypeScript, Tailwind, linting, formatting, and build
  foundations for a single-package modular monolith.
- Framework-independent shared, Agent Catalog, Auditing, and Remediation domain
  foundations with explicit application ports.
- Canonical serialization and SHA-256 content-fingerprint foundations.
- Prisma and SQLite persistence, committed migration, deterministic synthetic
  seed data, and temporary-database test infrastructure.
- Agent profile and immutable revision use cases, foundational API routes, and
  minimal local workspace pages.
- Persisted audit job creation, cancellation, leasing, and interruption
  reconciliation without fabricated audit completion or security results.
- Deterministic Demo and fake provider foundations; optional provider adapter
  code is isolated server-side, while Live audit creation remains disabled and
  automated checks stay keyless.
- Unit, application, integration, contract, architecture, security,
  accessibility, and keyless browser test foundations.
- Keyless Linux CI, a lightweight Windows compatibility lane, project community
  files, development guides, API reference, threat model, and initial ADRs.

### Security

- Added server-only configuration, safe public configuration projection,
  structured redacting logs, safe error envelopes, input limits, secure header
  foundations, and forbidden-execution architecture checks.

### Known limitations

- The complete audit engine, evidence evaluation, findings, final scoring,
  guardrails, verification comparison, and operational Live Mode are deferred
  to later milestones.
