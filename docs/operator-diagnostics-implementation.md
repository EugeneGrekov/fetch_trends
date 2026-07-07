# Operator Diagnostics Implementation

## Summary

Implemented local operator diagnostics for configuration, SQLite health, job health, collector readiness, artifact health, npm command health, and Markdown/JSON report output.

Diagnostics are read-only and do not apply migrations, launch browsers, call external services, run Codex, delete artifacts, or expose secret values.

## Files / Modules Added or Changed

- `src/diagnostics/types.ts`
- `src/diagnostics/sqlite.ts`
- `src/diagnostics/config-check.ts`
- `src/diagnostics/db-health.ts`
- `src/diagnostics/job-health.ts`
- `src/diagnostics/collector-health.ts`
- `src/diagnostics/artifact-health.ts`
- `src/diagnostics/command-health.ts`
- `src/diagnostics/report.ts`
- `src/commands/diagnose.ts`
- `src/diagnose.ts`
- `src/diagnostics/diagnostics.test.ts`
- `src/commands/diagnose.test.ts`
- `package.json`
- `package-lock.json`
- `docs/architecture.md`

## Commands Added or Changed

- Added `npm run diagnose`.
- Added compiled bin metadata for `fetch-trends-diagnose`.

Supported diagnostics options:

```bash
npm run diagnose
npm run diagnose -- --json
npm run diagnose -- --out ./diagnostics/report.md
npm run diagnose -- --live
npm run diagnose -- --db ./data/fetch-trends.sqlite
```

Additional local path overrides:

```bash
npm run diagnose -- --resultsDir ./results --artifactsDir ./artifacts
```

## Schema / Migration Changes

None.

Diagnostics read the existing SQLite database in read-only mode and report missing or stale migrations without applying them.

## Tests Added or Updated

Added diagnostics tests for:

- Configuration checks with mocked environment variables.
- Secret redaction for API-key variables.
- DB health against temp SQLite.
- Missing DB behavior.
- Missing table behavior.
- Failed jobs, stale running jobs, stale pending jobs, tool run errors, and completed jobs without reports.
- Collector readiness without live calls.
- Missing and orphan artifact checks with temp directories.
- JSON diagnostic output.
- CLI JSON and `--out` behavior.

## Verification Results

```bash
npm test
```

Passed: 27 test files, 75 tests.

```bash
npm run build
```

Passed.

```bash
npm run lint
```

Passed.

Manual smoke checks:

```bash
npm run diagnose
npm run diagnose -- --json
```

Both commands executed successfully. In this local workspace, diagnostics reported the default SQLite DB file as missing and `SERP_API_KEY` as missing. Those are expected local setup warnings/failures, not command execution failures.

## Known Limitations

- `--live` is accepted but does not run live probes in this phase; it reports that no external calls were made.
- Playwright browser installation is not launched or deeply verified by default.
- Artifact reference detection is best-effort. It infers known report artifact filenames and reads AI/autocomplete path metadata when available.
- Missing export/backup/restore scripts are reported as roadmap skips unless implemented by another phase.

## Follow-Up Work

- Add live collector probes only if a future phase explicitly defines safe opt-in behavior.
- Tighten artifact reference tracking if future report rows persist artifact paths directly.
- Add export/backup diagnostics once those commands and directory contracts are implemented.
