# Security Policy

Agent Auditor processes system prompts, tool schemas, permissions, and future
audit evidence. Treat all of that material as potentially sensitive, even when
running locally.

## Supported state

The project is pre-release and currently implements the engineering
foundation. There is no supported stable release line yet. Security fixes are
made against the current default branch; older commits and local forks are not
maintained.

This policy will be updated when versioned releases exist. The current
foundation does not claim to certify agent security, and its audit execution
engine is not yet implemented.

## Reporting a vulnerability

Please report suspected vulnerabilities privately:

1. Use the repository host's private vulnerability-reporting feature when it is
   available.
2. If private reporting is unavailable, contact the maintainer through the
   private contact method published on their repository-hosting profile.
3. Do not open a public issue containing exploit details or sensitive data.

Include only the minimum information needed to reproduce the issue:

- affected commit or version;
- operating system and Node.js version;
- the affected route, module, or trust boundary;
- reproducible steps using synthetic content;
- observed and expected behavior; and
- a suggested mitigation, if known.

Do **not** include real API keys, bearer tokens, credentials, private keys,
confidential prompts, customer data, production databases, or raw sensitive
evidence. Replace them with unmistakably synthetic canaries. If a report cannot
be explained safely without sensitive material, ask the maintainer to agree on
a secure transfer method first.

## Response expectations

Maintainers will make a good-faith effort to acknowledge a private report
within three business days and provide an initial assessment within seven
business days. These are targets, not guarantees. Timing depends on severity,
reproducibility, maintainer availability, and coordination needs.

The reporter can expect:

- confidential handling while a fix is prepared;
- a request for clarification when reproduction is incomplete;
- periodic updates for material issues; and
- credit in the eventual advisory or changelog when desired and appropriate.

Please allow a reasonable remediation period before public disclosure. The
maintainer will coordinate disclosure when a vulnerability affects users.

## In scope

- accidental secret exposure through HTTP responses, client bundles, logs,
  errors, SQLite, or generated artifacts;
- bypasses of request validation, size limits, host/origin/nonce checks, or
  idempotency protections;
- target-controlled shell, filesystem, network, browser, module, dynamic-code,
  or real-tool execution;
- unsafe rendering of agent or provider-controlled content;
- authorization assumptions that expose a non-loopback local service;
- persistence corruption, immutable-artifact mutation, job-lease races, or
  unsafe recovery behavior;
- dependency or build configuration that materially breaks the documented
  safety boundary.

## Out of scope

- claims that the product should detect every unsafe behavior or every secret;
- findings produced by an audit taxonomy that has not yet been implemented;
- social engineering outside project-controlled channels;
- denial of service requiring local machine control and no trust-boundary
  bypass;
- vulnerabilities in unsupported dependency versions without an Agent Auditor
  impact; and
- real-world attacks against systems or data not owned by the reporter.

Never test with real external tools, accounts, endpoints, or personal data. The
project's safety model permits only synthetic fixtures and closed simulation.

For design-level security context, read
[docs/security/THREAT_MODEL.md](docs/security/THREAT_MODEL.md).
