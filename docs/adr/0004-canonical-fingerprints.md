# ADR 0004: Canonical Serialization and Content Fingerprints

- **Status:** Accepted
- **Date:** 2026-07-18
- **Decision scope:** Immutable definition and plan identity

## Context

Agent revisions and future audit plans contain nested objects and ordered lists.
Ordinary JSON serialization depends on object insertion order, which would make
equivalent content produce different digests. Comparison, idempotency,
provenance, caching, and consent binding need a stable content identity that is
independent of framework and persistence records.

Using a database ID alone identifies a row, not its content. Storing raw JSON
without a canonical rule makes reproducibility ambiguous.

## Decision

Define an application-owned canonical JSON serialization for immutable content:

- object keys are sorted lexicographically and recursively;
- array order is preserved because tool, permission, case, and message ordering
  can be meaningful;
- strings, booleans, null, and finite JSON numbers use deterministic JSON text;
- unsupported JavaScript values, sparse arrays, non-plain or accessor-bearing
  objects, symbol/non-enumerable properties, non-finite numbers, and cycles fail
  safely;
- domain dates and IDs are converted to their explicit canonical string forms
  by mappers before serialization; and
- immutable definition envelopes include explicit schema/policy versions.

Infrastructure computes SHA-256 over the UTF-8 canonical text and represents the
result as a validated content fingerprint value object. Revision fingerprints
cover the complete immutable definition: prompt, tools, permissions,
operational controls, expected-safe-behavior notes, and relevant schema version.
Plan fingerprints will cover locked ordered test definitions, provenance,
fixtures, seed, and comparison-relevant budgets.

The canonical serializer remains a pure cross-cutting component; cryptographic
hashing is isolated behind a digest port/service where Node runtime APIs are
required.

## Properties required by tests

- Reordering object keys leaves canonical text and digest unchanged.
- Reordering an array changes canonical text and digest.
- Semantically equivalent validated definitions have the same revision
  fingerprint.
- Any prompt, tool, permission, operational-control, or version change changes
  the fingerprint.
- Unsupported input fails instead of being silently discarded or coerced.
- Repeated calls in different construction orders are deterministic.

## Consequences

### Positive

- Content identity is stable across DTO, domain, and persistence construction
  order.
- Immutable revisions and locked plans can be compared without trusting row IDs
  alone.
- Idempotency and future Live-consent metadata can bind to exact content.
- Canonical JSON text is reviewable and portable beyond SQLite.

### Costs and limitations

- Every schema change must state whether and how it changes the fingerprint
  envelope/version.
- Array ordering must be chosen deliberately; changing normalization rules is a
  compatibility change.
- Existing fingerprints cannot be recomputed with a new algorithm/version and
  treated as the same policy without migration handling.
- SHA-256 fingerprints are not keyed, signed, or an authenticity guarantee. A
  malicious local editor who can alter both data and digest is outside what the
  fingerprint detects.

## Alternatives considered

- **Plain `JSON.stringify`:** rejected because object insertion order can vary
  by construction path.
- **Database row IDs or timestamps:** rejected because they do not identify
  content.
- **Sorting arrays as well as objects:** rejected because array order is often
  semantically relevant and sorting could erase a real change.
- **Digital signatures:** deferred because the local MVP has no signing identity
  or key-management requirement.
- **Third-party canonicalization framework:** not selected because the required
  JSON subset is small, explicit, and testable without another abstraction.

## Revisit when

Any change to canonical number/string handling, envelope fields, digest
algorithm, or ordering rule requires a versioned migration/compatibility policy
and an ADR update. A future signed export is a separate feature layered over,
not a rebranding of, these fingerprints.
