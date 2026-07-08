# Operator Diagnostics Plan

## Goal

After data export and backup exist, add operator diagnostics so a local user can inspect configuration, failed jobs, database health, collector availability, generated artifacts, and common setup problems.

This phase should make the system easier to operate, debug, and trust as the number of commands, collectors, reports, and local artifacts grows.

Core rule:

```text
Diagnostics should explain what is broken, what is missing, and what to do next.
They should never expose secrets.
```

## Prerequisite

Complete and verify:

```text
docs/features/data-export-and-backup/plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- Local SQLite persistence.
- Validation jobs.
- External collectors.
- AI runner.
- Web interface.
- Reports and artifacts.
- Revalidation.
- Export and backup.

## Non-Goals

Do not add these in this phase:

- Cloud monitoring.
- Remote telemetry.
- Error reporting SaaS.
- Auto-repair of corrupted databases.
- Secret value display.
- Multi-user admin dashboard.
- Production observability stack.

This phase is local inspection and diagnostics only.

## Target Structure

Create:

```text
src/diagnostics/
  config-check.ts
  db-health.ts
  job-health.ts
  collector-health.ts
  artifact-health.ts
  command-health.ts
  report.ts
  types.ts

src/commands/
  diagnose.ts
```

Optional web additions:

```text
src/web/routes/diagnostics.ts
src/web/views/diagnostics.ts
```

Optional docs:

```text
docs/features/operator-diagnostics/implementation.md
```

## Implementation Steps

### Step 1: Add Diagnostic Result Types

Use a shared result shape:

```ts
export type DiagnosticStatus = 'pass' | 'warn' | 'fail' | 'skip';

export interface DiagnosticCheck {
  id: string;
  label: string;
  status: DiagnosticStatus;
  message: string;
  details?: Record<string, unknown>;
  nextAction?: string;
}
```

Every check should produce a clear status and next action.

### Step 2: Add Configuration Checks

Check:

- `FETCH_TRENDS_DB_PATH`.
- Results/artifacts path.
- Backup/export path if configured.
- Codex CLI availability.
- Collector API key presence.
- Node version.
- Playwright browser availability if practical.

Rules:

- Show `configured` or `missing`, not secret values.
- Do not print API keys.
- Missing optional collectors should be `warn`, not `fail`.

### Step 3: Add Database Health Checks

Check:

- DB file exists.
- DB file is readable.
- Required tables exist.
- Migration table exists.
- Latest migration appears applied.
- Basic counts can be read.
- SQLite integrity check passes if practical.

Important counts:

- Ideas.
- Jobs.
- Failed jobs.
- Reports.
- Sources.
- Evidence rows.
- Experiments.
- Decisions.

### Step 4: Add Job Health Checks

Find:

- Failed jobs.
- Running jobs older than a threshold.
- Pending jobs older than a threshold.
- Tool runs with errors.
- Jobs without reports.

Default stale thresholds:

```text
running job older than 2 hours -> warn
pending job older than 24 hours -> warn
failed jobs exist -> warn
```

### Step 5: Add Collector Health Checks

Check collector readiness:

- Autocomplete collector available.
- SERP provider configured or missing.
- Reddit configured or missing.
- YouTube configured or missing.
- Review collectors configured or missing.

Do not make live external API calls by default.

Optional flag:

```bash
npm run diagnose -- --live
```

Live checks are allowed only when explicitly requested.

### Step 6: Add Artifact Health Checks

Check:

- Artifact directory exists.
- Report artifact references exist.
- Missing artifact files.
- Orphan artifacts not referenced by DB.
- Large artifact directories.
- Backup directory exists if configured.

Do not delete or repair artifacts in this phase.

### Step 7: Add Command Health Checks

Check that core npm scripts exist:

- `autocomplete`.
- `validate`.
- `db`.
- `web`.
- `worker`.
- `payment-test`.
- `seo-plan`.
- `measurement`.
- `decide`.
- `revalidate`.
- `export-data`.
- `backup`.
- `restore`.

If some scripts are not implemented yet, classify as `skip` or `warn` based on roadmap status.

### Step 8: Add Diagnostic Report

Produce Markdown and JSON output.

Required sections:

- Summary.
- Critical failures.
- Warnings.
- Configuration.
- Database health.
- Job health.
- Collector readiness.
- Artifact health.
- Commands.
- Recommended next actions.

### Step 9: Add CLI Command

Add:

```bash
npm run diagnose
```

Options:

```bash
npm run diagnose -- --json
npm run diagnose -- --out ./diagnostics/report.md
npm run diagnose -- --live
npm run diagnose -- --db ./data/fetch-trends.sqlite
```

Default output should be human-readable Markdown or terminal text.

### Step 10: Optional Web Diagnostics Page

If web integration is added:

```text
/diagnostics
```

Show:

- Status summary.
- Failing checks.
- Warnings.
- Safe configuration status.
- Links to failed jobs/reports if available.

Do not expose secret values.

## Data / API / CLI Contracts

### Diagnostic JSON Output

```json
{
  "generatedAt": "2026-07-07T12:00:00.000Z",
  "status": "warn",
  "summary": {
    "pass": 12,
    "warn": 3,
    "fail": 0,
    "skip": 2
  },
  "checks": [
    {
      "id": "db.required_tables",
      "label": "Required database tables",
      "status": "pass",
      "message": "All required tables are present."
    }
  ],
  "nextActions": [
    "Configure SERP_API_KEY to enable SERP collector checks."
  ]
}
```

### CLI

Default:

```bash
npm run diagnose
```

JSON:

```bash
npm run diagnose -- --json
```

Write file:

```bash
npm run diagnose -- --out ./diagnostics/report.md
```

Live optional checks:

```bash
npm run diagnose -- --live
```

## Testing Plan

Add tests for:

- Config checks with mocked env.
- DB health against temp SQLite.
- Missing DB behavior.
- Missing table behavior.
- Failed job detection.
- Stale running/pending job detection.
- Collector readiness without live calls.
- Artifact missing/orphan checks with temp directories.
- JSON diagnostic output.
- CLI command output.

Default tests must not call:

- Live external APIs.
- Live Codex.
- Payment providers.
- Search Console.
- Network.

Use temp directories and temp SQLite databases.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

Optional manual smoke test:

```bash
npm run diagnose
npm run diagnose -- --json
```

## Acceptance Criteria

- Diagnostic modules exist.
- `npm run diagnose` works.
- JSON output is available.
- Configuration checks hide secret values.
- DB health checks required tables and basic integrity.
- Failed/stale jobs are reported.
- Collector readiness is reported without live calls by default.
- Artifact health is checked.
- Diagnostic report includes next actions.
- Default tests do not call live services.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Diagnostics can become noisy.
- Checks can expose sensitive paths or secrets.
- Live checks can accidentally call paid APIs.
- Required-command checks can fail during concurrent feature work.
- DB health checks may be too strict across migrations.

Mitigations:

- Hide secret values.
- Make live checks opt-in.
- Use `warn` for optional collectors.
- Include next actions.
- Keep checks version-aware where practical.

## Recommended Next Phase

After operator diagnostics exist, add release packaging:

```text
docs/features/release-packaging/plan.md
```

That phase should make the local CLI, web app, skills, docs, and migrations easier to install, run, verify, and distribute.
