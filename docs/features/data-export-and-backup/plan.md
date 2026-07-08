# Data Export and Backup Plan

## Goal

After scheduled revalidation exists, add data export, archive, backup, and restore support for local validation evidence and reports.

This phase should make the local SQLite-backed system safer to use over time and easier to move, inspect, or share.

Core rule:

```text
Evidence is valuable.
Local data must be exportable, restorable, and auditable.
```

## Prerequisite

Complete and verify:

```text
docs/features/scheduled-revalidation/plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- Local SQLite persistence.
- Ideas, jobs, tool runs, sources, evidence, reports, scores, experiments, decisions, and revalidation data.
- Generated artifacts.
- Local web UI.
- CLI commands for validation and follow-up workflows.

## Non-Goals

Do not add these in this phase:

- Cloud backup.
- Team sharing.
- Google Drive/Dropbox/iCloud integration.
- Encryption key management.
- Public report hosting.
- Multi-user access control.

This phase is local export and restore only.

## Target Structure

Create:

```text
src/export/
  bundle-writer.ts
  bundle-reader.ts
  backup.ts
  restore.ts
  redaction.ts
  types.ts

src/commands/
  export-data.ts
  backup.ts
  restore.ts
```

Optional web additions:

```text
src/web/routes/export.ts
src/web/views/export.ts
```

## Implementation Steps

### Step 1: Define Export Bundles

Support export bundle types:

```text
idea_bundle
portfolio_bundle
full_backup
report_bundle
```

Bundle formats:

```text
json
markdown
zip
```

Initial implementation can support JSON and Markdown first, ZIP later.

### Step 2: Add Idea Export

Export all data related to one idea:

- Idea row.
- Jobs.
- Tool runs.
- Queries.
- Autocomplete predictions.
- Sources.
- Evidence.
- Competitors.
- Scores.
- Reports.
- Experiments.
- Events.
- Decisions.
- Revalidation runs.
- Artifact paths or copied artifacts.

### Step 3: Add Portfolio Export

Export summary data for multiple ideas:

- Idea metadata.
- Latest score.
- Latest decision.
- Latest report summary.
- Portfolio bucket.
- Best next action.

This is for review and prioritization, not full restore.

### Step 4: Add Full Backup

Create a local backup of:

- SQLite database file.
- Artifacts directory.
- Optional reports directory.
- Metadata manifest.

Backup should be timestamped.

Example:

```text
backups/fetch-trends-2026-07-07T120000Z/
  fetch-trends.sqlite
  artifacts/
  manifest.json
```

### Step 5: Add Restore

Support restore from a full backup.

Rules:

- Refuse to overwrite current DB unless `--force` is passed.
- Validate manifest before restore.
- Restore to a target DB path.
- Preserve current data by default.

### Step 6: Add Redaction

Add optional redaction for sharing exports.

Redactable fields:

- Source URLs.
- Exact quotes.
- Raw tool outputs.
- Metadata JSON.
- Local file paths.

Modes:

```text
none
basic
strict
```

Default:

```text
basic
```

### Step 7: Add CLI Commands

Commands:

```bash
npm run export-data -- --idea-id <id> --format json --out ./exports/idea-<id>.json
npm run export-data -- --portfolio --format markdown --out ./exports/portfolio.md
npm run backup -- --out ./backups
npm run restore -- --backup ./backups/<backup-id> --target-db ./data/restored.sqlite
```

### Step 8: Optional Web Export

If web UI integration is added, expose:

- Export idea button.
- Export portfolio button.
- Backup status page.

Do not expose restore through web UI in the first implementation.

## Data / API / CLI Contracts

### Bundle Manifest

```json
{
  "version": 1,
  "bundleType": "idea_bundle",
  "createdAt": "2026-07-07T12:00:00.000Z",
  "app": "fetch-trends",
  "ideaIds": [123],
  "redaction": "basic",
  "files": []
}
```

### Export Command

```bash
npm run export-data -- --idea-id 123 --format json --out ./exports/idea-123.json
```

### Backup Command

```bash
npm run backup -- --out ./backups
```

### Restore Command

```bash
npm run restore -- --backup ./backups/fetch-trends-2026-07-07T120000Z --target-db ./data/restored.sqlite
```

## Testing Plan

Add tests for:

- Idea bundle generation.
- Portfolio export generation.
- Markdown export formatting.
- Redaction modes.
- Backup manifest creation.
- Backup file copy.
- Restore to temp DB path.
- Refuse overwrite without `--force`.
- CLI commands with temp SQLite DB.

Default tests must not require:

- Network.
- Cloud storage.
- Live Codex.
- External APIs.

Use temp directories and fixture DBs.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

Optional manual smoke test:

```bash
npm run export-data -- --portfolio --format markdown --out ./exports/portfolio.md
npm run backup -- --out ./backups
```

## Acceptance Criteria

- Idea export works.
- Portfolio export works.
- Full local backup works.
- Restore to a target DB path works.
- Redaction is available.
- Backup manifest is written.
- Commands refuse dangerous overwrites by default.
- Default tests do not call external services.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Exported data can leak sensitive quotes or local paths.
- Restore can overwrite valuable current data.
- Bundle schemas can drift as tables evolve.
- Large artifact directories can make backups slow.

Mitigations:

- Redaction defaults to `basic`.
- Restore requires explicit target or `--force`.
- Manifest includes version.
- Tests cover schema shape and restore behavior.

## Recommended Next Phase

After local export and backup work, add product hardening and operator diagnostics:

```text
docs/features/operator-diagnostics/plan.md
```

That phase should make it easier to inspect configuration, failed jobs, DB health, collector availability, and local artifact integrity.
