# HTTP API Reference

## 1. Scope and stability

The local Agent Auditor API is versioned under `/api/v1`. It supports the
engineering-foundation workflows: health/configuration reads, agent profile and
immutable revision management, and truthful creation/inspection/cancellation
of persisted audit requests.

The complete audit engine is not implemented. Creating a Demo audit returns a
queued foundation run; it does not produce evidence, findings, scores,
guardrails, or a completed security result. Live audit creation is disabled in
this phase even if optional adapter configuration is present, and there is no
silent Live-to-Demo fallback.

This API is local and unauthenticated. It is designed for the application UI on
a loopback server, not exposure on a LAN or the public internet.

## 2. Conventions

### Base URL

The default development origin is:

```text
http://127.0.0.1:3000/api/v1
```

The server also accepts the configured loopback origin. Binding outside
loopback is unsupported.

### Media types and envelopes

Successful JSON responses use `application/json` and a top-level `data` member:

```json
{
  "data": {}
}
```

Successful deletion returns `204 No Content`. Errors use
`application/problem+json` and are not wrapped in `data`.

Mutation bodies must use `Content-Type: application/json`. The default maximum
body size is 128 KiB, enforced against both declared and observed bytes. Unknown
fields are rejected by strict request schemas. Dangerous object keys such as
`__proto__`, `constructor`, and `prototype` are rejected recursively.

IDs are opaque strings. Times are UTC ISO 8601 strings. Enum values are
uppercase as shown in this reference. Clients must not derive meaning from ID
format or database ordering.

`GET /agents` and `GET /audits` accept an integer `limit` query parameter from
1 through 100; the default is 20. `GET /agents` additionally accepts the opaque
`cursor` returned as `nextCursor` by the previous page. Omit it for the first
page; `nextCursor: null` marks the end.

### Correlation IDs

A client may send `x-correlation-id` containing 1–64 ASCII letters, digits,
periods, underscores, or hyphens, beginning with a letter or digit. Invalid or
absent values are replaced. Every problem response includes the effective
`correlationId`, and successful foundation routes expose it in the
`x-correlation-id` response header. Quote it when reporting a failure without
including sensitive request content.

## 3. Local mutation protection

State-changing requests must satisfy all of these controls:

1. The request URL host is `127.0.0.1`, `::1`, or `localhost`.
2. When an `Origin` header is present, it exactly matches the request origin.
3. The request carries the current process token in
   `x-agent-auditor-token`.
4. A body, when required, is JSON and within the size limit.

Fetch the process token from `GET /api/v1/config` on the same origin. The token
is a per-process anti-cross-site nonce, not an API credential. It changes when
the server restarts and must not be persisted. Browser same-origin policy and
the absence of permissive CORS prevent an unrelated origin from reading it. The
configuration and health responses use `Cache-Control: no-store`.

Example mutation headers:

```http
Content-Type: application/json
Origin: http://127.0.0.1:3000
x-agent-auditor-token: <value returned by /api/v1/config>
x-correlation-id: local-ui-42
```

Both audit-creation routes require `Idempotency-Key`. The value must be 8–128 characters,
start with a letter or digit, and otherwise contain only letters, digits, `.`,
`_`, `:`, or `-`. Reusing the key with the same logical request returns the
existing accepted run and sets `x-idempotent-replay: true`; conflicting reuse
returns `409`. An absent key returns `400 IDEMPOTENCY_KEY_REQUIRED`.

## 4. Problem details

Example:

```json
{
  "type": "https://agent-auditor.local/problems/validation_failed",
  "title": "Validation failed",
  "status": 422,
  "detail": "The request does not satisfy the API contract.",
  "code": "VALIDATION_FAILED",
  "correlationId": "95623a1a-c9a2-48e4-816d-2572fdf9b2bd",
  "errors": [
    {
      "field": "definition.systemPrompt",
      "message": "Too small: expected string to have >=1 characters"
    }
  ]
}
```

| Status | Meaning                                                                              |
| ------ | ------------------------------------------------------------------------------------ |
| `400`  | Malformed JSON or request syntax                                                     |
| `403`  | Non-loopback request, rejected origin, or absent/invalid mutation token              |
| `404`  | Resource does not exist                                                              |
| `409`  | Domain/application conflict, including active-audit deletion or idempotency conflict |
| `413`  | Request body exceeds the configured limit                                            |
| `415`  | Mutation body is not `application/json`                                              |
| `422`  | Parsed request violates the boundary schema or a domain invariant                    |
| `500`  | Safe unexpected failure; raw exception and stack are omitted                         |
| `503`  | Explicitly selected Live Mode is unavailable or unconfigured                         |

`errors` is optional and contains `{field, message}` entries only when safe
field-level validation details exist. `code` is the stable programmatic value;
`detail` is safe human-readable text and must not be parsed for control flow.

## 5. Resource representations

### Agent profile summary

Agent list/detail projections expose stable profile metadata:

| Field                       | Type          | Meaning                                                                |
| --------------------------- | ------------- | ---------------------------------------------------------------------- |
| `id`                        | string        | Stable opaque profile ID                                               |
| `name`                      | string        | Display name, 1–120 characters after normalization                     |
| `description`               | string        | Optional description represented as a string, at most 2,000 characters |
| `createdAt`                 | UTC timestamp | Creation time                                                          |
| `updatedAt`                 | UTC timestamp | Last profile record update time                                        |
| `latestRevisionId`          | string        | Current immutable revision ID when present                             |
| `latestRevisionNumber`      | integer       | Current profile-local revision number                                  |
| `latestRevisionFingerprint` | string        | Canonical fingerprint of the current revision                          |

Profile objects also expose `recordVersion` for controlled mutations and
`archivedAt` as a UTC timestamp or `null`. List summaries are flat objects that
combine these profile fields with the three `latestRevision*` fields.

### Agent revision

A revision DTO contains `id`, `agentProfileId`, `revisionNumber`,
`sourceRevisionId` (or `null`), `systemPrompt`, `safeBehaviorNotes`, ordered
`tools`, ordered `permissions`, `operationalControls`,
`definitionSchemaVersion`, `contentScanVersion`, `contentScanStatus`,
`secretWarningAcknowledgedAt` (or `null`), `creationSource`, `fingerprint`, and
`createdAt`. Tool DTOs include their server-owned ID, ordinal, fingerprint, and
`schemaVersion`. Permission DTOs include their server-owned ID, ordinal,
fingerprint, `scopeSchemaVersion`, stable `toolDefinitionId` (or `null`), and
normalized `toolName` (or `null`). Existing revisions cannot be updated.

Fingerprints are SHA-256 digests of canonical immutable content. They support
change detection and provenance; they are not signatures.

### Audit run

An audit projection contains at least:

| Field                                     | Type             | Meaning                                          |
| ----------------------------------------- | ---------------- | ------------------------------------------------ |
| `id`                                      | string           | Stable run ID                                    |
| `agentRevisionId`                         | string           | Exact immutable target revision                  |
| `mode`                                    | `DEMO` or `LIVE` | Explicit selected mode                           |
| `status`                                  | audit status     | Coarse persisted lifecycle                       |
| `currentPhase`                            | phase            | Fine-grained current work label                  |
| `createdAt` / `updatedAt`                 | UTC timestamp    | Lifecycle times                                  |
| `plannedCaseCount` / `completedCaseCount` | integer          | Persisted progress; both remain honest           |
| `failure`                                 | object or null   | Safe code/summary for failed or interrupted work |

The projection also includes `agentRevisionFingerprint`, `runPurpose`,
`attemptNumber`, `recordVersion`, `engineVersion`, `taxonomyVersion`,
`evaluationPolicyVersion`, `scoringPolicyVersion`, `fixtureVersion`,
`startedAt`, and `completedAt`. It excludes the idempotency key, internal job
lease data, request fingerprint, raw database JSON, and provider payloads.

Coarse statuses are `QUEUED`, `PLANNING`, `EXECUTING`, `EVALUATING`,
`FINALIZING`, `CANCELLING`, `CANCELLED`, `INTERRUPTED`, `FAILED`, and
`COMPLETED`. This foundation creates `QUEUED` runs but does not advance them to
false completion.

## 6. Agent definition request

`POST /agents` wraps an initial definition with profile metadata. `POST
/agents/:agentId/revisions` accepts the definition object directly and derives a
new immutable revision from the profile's latest revision.

Representative create request using synthetic data:

```json
{
  "name": "Example Assistant",
  "description": "Works only with synthetic notes.",
  "definition": {
    "systemPrompt": "Assist with synthetic notes and request confirmation before sensitive changes.",
    "safeBehaviorNotes": "Never act outside declared synthetic capabilities.",
    "tools": [
      {
        "name": "save_note",
        "displayName": "Save note",
        "description": "Save a note in the synthetic notebook.",
        "schemaVersion": "1.0.0",
        "inputSchema": {
          "type": "object",
          "properties": {
            "title": {
              "type": "string",
              "minLength": 1,
              "maxLength": 120
            }
          },
          "required": ["title"],
          "additionalProperties": false
        },
        "simulatorId": "synthetic_note_writer",
        "simulatorConfig": {
          "fixtureId": "basic_notes"
        },
        "capability": {
          "key": "notes.save",
          "impact": "LOW",
          "dataSensitivity": "SYNTHETIC",
          "destructive": false
        }
      }
    ],
    "permissions": [
      {
        "toolName": "save_note",
        "capabilityKey": "notes.save",
        "effect": "ALLOW",
        "resourceType": "synthetic_note",
        "scopeSchemaVersion": "1.0.0",
        "scope": {
          "allSyntheticResources": true
        },
        "conditions": {
          "requiresUserIntent": true
        },
        "requiresConfirmation": false
      }
    ],
    "operationalControls": {
      "schemaVersion": "1.0.0",
      "maxRetries": 0,
      "stopConditions": ["ON_BUDGET_EXHAUSTED", "ON_PERMISSION_DENIAL", "ON_SIMULATOR_ERROR"],
      "escalationRequiredFor": [],
      "confirmationRequiredFor": [],
      "evidenceRequirements": ["ASSERTION_RESULTS", "PERMISSION_DECISIONS", "TOOL_ATTEMPTS"]
    }
  }
}
```

Tool input schemas must have an object root and use only the documented safe
subset: object, array, string, number, integer, boolean, `properties`,
`required`, `items`, `enum`, `const`, numeric/string/array bounds,
`additionalProperties` as a boolean, and descriptions. References, recursive or
remote schemas, patterns, executable/custom extensions, excessive depth/size,
and target-controlled code/path/URL metadata are rejected.

Defaults exist for definition collections, operational controls, schema
versions, simulator configuration, permission conditions, and safe behavior
notes. Clients should send explicit values when they need stable reviewable
intent.

## 7. Endpoints

### Health and configuration

| Method and path      | Success        | Contract                                                                                                                                                                                                                                                                                                               |
| -------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/health` | `200` or `503` | Returns `service`, `applicationVersion`, `status` (`ok` or `degraded`), `database` (`reachable` or `unreachable`), `demoModeAvailable`, and `liveModeConfigured`. An unreachable database produces a safe degraded `503`.                                                                                              |
| `GET /api/v1/config` | `200`          | Returns `applicationVersion`, `demoModeAvailable`, `liveModeConfigured`, `maximumCases`, and the current `mutationToken` under `data`. The Live flag reports optional adapter configuration only; this phase still rejects Live audit creation. It never returns a credential, database URL, or raw environment value. |

Example public configuration:

```json
{
  "data": {
    "applicationVersion": "0.1.0",
    "demoModeAvailable": true,
    "liveModeConfigured": false,
    "maximumCases": 24,
    "mutationToken": "per-process-value"
  }
}
```

### Agent Catalog

| Method and path                          | Success | Contract                                                                                                                                                  |
| ---------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/agents`                     | `200`   | Returns recent active profile summaries under `data.items` and opaque `data.nextCursor` or `null`. No fabricated metrics are included.                    |
| `POST /api/v1/agents`                    | `201`   | Accepts the wrapped definition, creates profile/revision 1 atomically, and returns `{id, profile, revision}`.                                             |
| `GET /api/v1/agents/:agentId`            | `200`   | Returns `{profile, revisions}` with every immutable revision newest first; `404` when absent.                                                             |
| `DELETE /api/v1/agents/:agentId`         | `204`   | Requires `x-confirm-agent-purge: <agentId>`, then deletes through a controlled transaction. Returns `409` for confirmation mismatch or active audit.      |
| `GET /api/v1/agents/:agentId/revisions`  | `200`   | Returns immutable revisions newest first under `data.items`; `404` when the profile is absent.                                                            |
| `POST /api/v1/agents/:agentId/revisions` | `201`   | Accepts a complete definition object, validates it, derives from the latest revision, allocates the next number atomically, and returns the new revision. |
| `GET /api/v1/revisions/:revisionId`      | `200`   | Returns one complete immutable revision; `404` when absent.                                                                                               |

Creating a revision never edits an older revision. A duplicate/competing revision
number or a domain conflict returns `409` rather than overwriting history.

Deletion is an explicit local privacy purge, not an ordinary soft delete. The
`x-confirm-agent-purge` value must exactly equal the opaque `agentId` in the
route. Do not send a body. The mutation token, loopback, and Origin controls
remain required.

### Audits

| Method and path                       | Success | Contract                                                                                                                                                                                     |
| ------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/audits`                  | `200`   | Returns recent audit-run projections under `data.items`, newest first.                                                                                                                       |
| `POST /api/v1/audits`                 | `202`   | Accepts `{agentRevisionId, mode}` plus required `Idempotency-Key`. Derives the owning profile, persists the run/job atomically, and returns the accepted projection with `idempotentReplay`. |
| `POST /api/v1/agents/:agentId/audits` | `202`   | Convenience alias with the same body/header. The revision must belong to `:agentId`; a client cannot override ownership.                                                                     |
| `GET /api/v1/audits/:runId`           | `200`   | Returns one persisted run projection; `404` when absent. It never synthesizes result artifacts.                                                                                              |
| `POST /api/v1/audits/:runId/cancel`   | `202`   | Durably requests cancellation and returns the current cancelling/cancelled projection. Repeated compatible cancellation is idempotent.                                                       |

Create Demo audit:

```http
POST /api/v1/audits HTTP/1.1
Content-Type: application/json
Idempotency-Key: demo-audit-0001
x-agent-auditor-token: <current process token>

{
  "agentRevisionId": "<opaque revision id>",
  "mode": "DEMO"
}
```

A `LIVE` request returns `503 LIVE_MODE_UNAVAILABLE` in this keyless foundation,
including when optional adapter environment values happen to be present.
Automated checks exercise that safe failure and never issue a live call.

## 8. Compatibility rules

- Additive response fields may be introduced within `v1`; clients should ignore
  unknown response fields.
- Request objects are strict. Adding a request field requires a coordinated
  client/server update and contract tests.
- Renaming/removing fields or changing semantics requires a new API version or
  an explicitly documented migration period.
- Domain error codes and status mappings are stable integration points.
- Provider SDK records and Prisma records never appear in the HTTP contract.
- Any route that changes the local/external data boundary requires an ADR and
  threat-model update.
