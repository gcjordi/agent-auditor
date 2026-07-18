# Database Development

Agent Auditor uses Prisma with a local SQLite database. SQLite is the system of
record for profiles, immutable revisions, foundational audit artifacts, and the
persisted job lifecycle. The domain never consumes generated Prisma records
directly; infrastructure mappers validate and translate every persisted shape.

The complete conceptual model and retention rules are documented in
[Database Design](../DATABASE_DESIGN.md).

## Storage warning

SQLite is plaintext local storage. System prompts, safe behavior notes, and
future sanitized evidence may still be sensitive. Protect the database and its
backups with filesystem controls. Do not place credentials or real confidential
data in seed fixtures, tests, screenshots, bug reports, or example definitions.

Runtime databases, journals, and temporary test databases are ignored by Git.
Before committing, inspect `git status` and `git ls-files` rather than assuming
an ignore pattern protected a new filename.

## Commands

```shell
pnpm db:generate          # generate client code for the pinned Prisma version
pnpm db:validate          # validate schema and datasource configuration
pnpm db:migrate           # create/apply a migration during development
pnpm db:migrate:deploy    # apply committed migrations without creating one
pnpm db:seed              # load deterministic synthetic profiles
pnpm db:reset             # destructively reset the configured development DB
pnpm db:studio            # open Prisma Studio for the configured DB
```

`prisma/schema.prisma`, the Prisma configuration, and committed migration
directories are the source of truth. Do not use `prisma db push` for normal
development or release migration workflows.

## Creating a migration

1. Read [Database Design](../DATABASE_DESIGN.md) and identify the owning bounded
   context and aggregate invariant.
2. Change `prisma/schema.prisma` and the explicit infrastructure mappers in the
   same branch.
3. Create a descriptively named development migration with `pnpm db:migrate`.
4. Review the generated SQL. Verify foreign keys, uniqueness, indexes,
   referential actions, defaults, and any append-only assumptions.
5. Regenerate the client and run validation.
6. Add integration tests that apply the entire committed migration path to a
   fresh temporary database.
7. Test read-time rejection of malformed versioned JSON as well as successful
   round trips.
8. Update the database design or add an ADR if the persistence contract changes
   materially.

Never edit or delete a migration that may have been applied outside your local
throwaway environment. Add a forward migration instead.

## Canonical JSON fields

Relational columns hold frequently queried metadata. Heterogeneous definitions
use canonical JSON text only where relational modeling would be counterproductive.
Every such value requires:

- a schema version;
- a boundary parser;
- explicit write-time canonicalization;
- explicit persistence mapping;
- read-time validation; and
- a migration plan when its schema changes.

Object-key order is normalized; array order remains meaningful. SHA-256 content
digests detect definition changes and support reproducibility, but they are not
digital signatures or proof against a malicious local database editor.

## Immutability and transactions

- Agent revisions and completed audit artifacts are append-only.
- New revisions receive a profile-local monotonic revision number inside a
  controlled transaction.
- Profile creation persists the profile and initial revision atomically.
- Audit creation persists the run and queued job atomically and requires an
  idempotency key for every request.
- Provider work must never occur inside a database transaction.
- Mutable job rows use bounded leases and optimistic/version metadata where
  appropriate.
- Profile deletion is a controlled transaction and is rejected while an active
  audit exists.

Repository code, not a UI component or route handler, owns persistence mapping.
Business rules remain in domain/application policies.

## Test databases

Automated tests allocate unique SQLite files under temporary directories and
apply committed migrations. They do not call `db:reset` against the development
database and do not depend on seed data unless a test explicitly invokes the
deterministic seed path.

When a test fails on Windows, first close every Prisma client and file viewer;
an open handle can prevent cleanup. Test cleanup must resolve and verify its
temporary target before removing it.

## Backups and destructive operations

Before `pnpm db:reset` or a destructive future migration:

1. resolve the exact SQLite file from the validated development configuration;
2. stop the application and close database viewers;
3. copy the database and its active journal files to a protected location if
   the data matters;
4. verify the backup can be opened; and
5. run the operation only against the intended development database.

Deleting rows does not guarantee immediate removal of their bytes from the
SQLite file. Vacuuming or secure deletion is a separate, explicit maintenance
operation and is not silently performed by ordinary application commands.

## Release migration check

A release candidate must prove that:

- the Prisma schema validates;
- a fresh empty database accepts every committed migration;
- foreign-key checks succeed;
- mapper and repository integration tests pass;
- seed data is idempotent;
- no runtime database is tracked; and
- migration and rollback/backup limitations are documented.
