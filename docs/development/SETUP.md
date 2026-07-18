# Development Setup

This guide prepares a clean checkout for local, keyless development. Agent
Auditor is a single Node.js process with an embedded SQLite database; it does
not require a cloud service, container, external queue, or OpenAI API key.

## Supported toolchain

| Tool    | Pinned version | Source of truth                            |
| ------- | -------------- | ------------------------------------------ |
| Node.js | 24.18.0        | `.node-version` and `package.json` engines |
| pnpm    | 11.14.0        | `package.json#packageManager`              |

Git and a shell are also required. Corepack should be available with the pinned
Node distribution. Do not use npm or Yarn to install dependencies; the pnpm
lockfile is the reproducibility boundary.

## Clean installation

```shell
corepack enable
pnpm --version
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate:deploy
pnpm db:seed
pnpm dev
```

Open `http://127.0.0.1:3000`. The application binds to loopback by default.
The idempotent seed creates three original synthetic examples: Support Desk
Agent, Research Assistant, and Operations Agent. It is safe to run again and
does not seed fake completed audits.

If Corepack cannot activate the declared pnpm version, verify that the pinned
Node distribution is first on `PATH`. Do not regenerate the lockfile with a
different package manager as a workaround.

## Environment configuration

The application has safe local defaults. To override them, copy the example
file and edit the copy:

```shell
# macOS or Linux
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item -LiteralPath .env.example -Destination .env
```

`.env` and local variants are ignored by Git. Before committing, confirm that
no environment file, database, generated report, coverage directory, or browser
artifact is tracked.

The configuration layer validates server environment values once at startup.
Important settings include:

- `NODE_ENV`: validated runtime environment (`development`, `test`, or
  `production`). Framework scripts normally set it.
- `DATABASE_URL`: SQLite connection URL; defaults to
  `file:./prisma/dev.db` from the repository root.
- `APP_HOST` and `APP_PORT`: validated local-origin metadata. `APP_HOST` accepts
  loopback names/addresses only. Standard scripts bind `127.0.0.1:3000`
  explicitly.
- `LOG_LEVEL`: structured log severity threshold.
- `AUDIT_CONCURRENCY`: bounded local job concurrency.
- `AUDIT_MAX_TEST_CASES`: upper case-count limit.
- `AUDIT_MAX_DURATION_SECONDS`: upper run duration budget in seconds.
- `AUDIT_PROVIDER`: preferred future provider (`demo` by default); selecting
  `openai` does not enable Live audit creation in this phase.
- `PROVIDER_TIMEOUT_MS`: timeout for future provider work.
- `DEMO_SEED`: deterministic Demo seed.
- `OPENAI_API_KEY`: optional and server-only; leave unset for foundation work.
- `OPENAI_MODEL`: optional future Live model reference; it must be supplied
  together with the key.

The complete Live audit path is not available in this foundation. Supplying a
key is unnecessary and does not make the unimplemented engine operational. No
required command or automated test reads or calls a live provider.

Never add a secret to a `NEXT_PUBLIC_` variable. The browser receives only the
allow-listed public configuration projection.

## Common workflows

### Start development

```shell
pnpm dev
```

Next.js development output may be verbose. Application events use the
structured logger; application source should not add `console.log` calls.

### Recreate local synthetic data

```shell
pnpm db:reset
pnpm db:seed
```

`db:reset` is destructive. Confirm that `DATABASE_URL` points to the disposable
development database, not a database you need to preserve. Automated tests do
not use this database.

### Validate before review

```shell
pnpm verify
pnpm build
```

`pnpm verify` runs the keyless local quality gates in a stable order. See
[Testing](TESTING.md) for focused suites and [Database development](DATABASE.md)
for migration work.

## Windows notes

- Use a current PowerShell session after changing Node versions so `PATH` and
  Corepack shims are refreshed.
- Keep the repository in a path where the current user can create and replace
  temporary SQLite files.
- Close Prisma Studio or other database viewers before a destructive reset;
  Windows file locks may otherwise prevent replacement.
- CI includes a lightweight Windows lane to detect path, script, and generated
  client portability issues.

## Troubleshooting

### Prisma client is missing or stale

```shell
pnpm db:generate
pnpm typecheck
```

Regenerate after installing dependencies or changing `prisma/schema.prisma`.

### The database schema is missing

```shell
pnpm db:validate
pnpm db:migrate:deploy
pnpm db:seed
```

Do not use `prisma db push` as a substitute for committed migrations.

### Port 3000 is already in use

Stop the other local process, or invoke Next.js with an explicit alternate
loopback port and set `APP_PORT` to the same value. The packaged `dev` and
`start` commands intentionally use `127.0.0.1:3000`. Binding outside loopback is
unsupported because the MVP has no authentication or multi-user isolation.

### Live Mode is unavailable

That is the expected foundation state. Continue in Demo Mode. The application
must return an explicit unavailable/configuration response rather than silently
changing modes.
