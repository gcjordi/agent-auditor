## Summary

Describe the user or engineering outcome and why the change is needed.

## Validation

List the exact commands run and their results. Do not mark a check complete if
it was not run successfully.

- [ ] `pnpm verify`
- [ ] `pnpm build`
- [ ] `pnpm test:e2e` when the browser path is affected

## Review checklist

- [ ] The change respects Domain/Application/Infrastructure/Presentation
      boundaries and module public APIs.
- [ ] New behavior has meaningful tests at the appropriate level.
- [ ] The change remains fully usable and testable without an API key.
- [ ] No real tool, arbitrary execution, filesystem, browser, or network path
      was added for target-controlled input.
- [ ] Security, privacy, accessibility, and failure states were considered.
- [ ] Database changes include a committed migration and mapper/integration
      tests.
- [ ] Documentation and `CHANGELOG.md` match actual behavior without future or
      certification claims.
- [ ] No secret, confidential prompt, runtime database, environment file,
      report, coverage output, or browser artifact is included.

## Security and data notes

Describe any changed trust boundary, persisted content, external transmission,
or residual risk. Write `None` only after reviewing the threat model.

## Screenshots

Include only when presentation behavior changed. Use synthetic data and check
the image for secrets or sensitive local content before attaching it.
