# SQLite Foundation Implementation

## Scope Delivered

This implementation turns the SQLite foundation plan into a working local persistence slice without changing the existing `autocomplete` command behavior.

Delivered pieces:

- Local SQLite connection and path resolution.
- Idempotent migration runner.
- Initial validation schema.
- Typed repositories for ideas, jobs, tool runs, queries, predictions, scores, and reports.
- First `validate` command that persists an autocomplete-backed validation run.
- First `db` command for migrations.
- Deterministic tests for migrations, repositories, and the validation orchestrator.

## Entry Points

New scripts:

```bash
npm run db -- --migrate
npm run validate -- --idea "automatic app that saves parking location when Bluetooth disconnects"
```

Entrypoints:

- `src/db.ts`
- `src/validate.ts`
- `src/commands/db.ts`
- `src/commands/validate.ts`

The existing compatibility path remains unchanged:

```bash
npm run autocomplete
```

## Database Foundation

### Path Resolution

Implemented in:

- `src/db/connection.ts`

Rules:

- CLI flag path wins when provided.
- Otherwise `FETCH_TRENDS_DB_PATH` is used.
- Otherwise the default path is `./data/fetch-trends.sqlite`.
- Parent directories are created automatically.

### Migration Runner

Implemented in:

- `src/db/migrations.ts`

Behavior:

- Creates `schema_migrations` if missing.
- Applies migrations in order.
- Skips already-applied migrations.
- Wraps each migration in a transaction.
- Exposes the applied migration ids to the CLI.

Initial migration:

- `001_initial_validation_tables`

### Schema Implemented

The initial migration creates:

- `ideas`
- `jobs`
- `tool_runs`
- `queries`
- `autocomplete_predictions`
- `scores`
- `reports`
- `schema_migrations`

The migration also creates basic supporting indexes on foreign-key and query lookup columns.

## Repository Layer

Implemented in:

- `src/db/repositories/ideas.ts`
- `src/db/repositories/jobs.ts`
- `src/db/repositories/tool-runs.ts`
- `src/db/repositories/queries.ts`
- `src/db/repositories/autocomplete-predictions.ts`
- `src/db/repositories/scores.ts`
- `src/db/repositories/reports.ts`

Repository responsibilities:

- Insert rows with typed inputs.
- Reload inserted rows for deterministic return values.
- Provide simple read helpers for tests and orchestration.
- Provide job/tool-run completion and failure lifecycle updates.

## Validation Flow

Implemented in:

- `src/validation/orchestrator.ts`
- `src/validation/idea-normalizer.ts`
- `src/validation/query-generator.ts`
- `src/validation/scoring.ts`
- `src/validation/report-generator.ts`

Pipeline:

1. Normalize the input idea into a minimal structured shape.
2. Create an `ideas` row.
3. Create a `jobs` row with `job_type='validate'`.
4. Generate deterministic initial query seeds.
5. Store those seeds in `queries`.
6. Create a `tool_runs` row for the autocomplete utility.
7. Run the existing autocomplete utility through `runAutocompleteResearch`.
8. Store raw autocomplete evidence in `autocomplete_predictions`.
9. Build a simple search-language score and store it in `scores`.
10. Generate a Markdown report and store it in `reports`.
11. Mark the tool run and job complete or failed.

## Autocomplete Persistence Boundary

The implementation keeps the boundary from the plan:

- `autocomplete` still behaves as a standalone utility that writes CSV/JSON artifacts.
- SQLite persistence happens in `validate`, not by adding DB coupling directly to `autocomplete`.

This keeps the utility reusable and avoids mixing persistence concerns into the collector path.

## Report Behavior

The generated Markdown report includes:

- Idea summary
- Query seeds
- Top autocomplete predictions
- Intent breakdown
- Strongest high-intent queries
- Problem-intent queries
- Weak queries
- Initial score
- Missing evidence
- Next action

It also includes the required disclaimer:

`This report validates search language only. It does not prove demand size or willingness to pay.`

## Tests Added

Implemented tests:

- `src/db/migrations.test.ts`
- `src/db/repositories/repositories.test.ts`
- `src/validation/orchestrator.test.ts`

Coverage includes:

- Migration idempotency
- Table creation
- Repository insert/read paths
- Job and tool-run lifecycle updates
- Stored autocomplete predictions
- Stored score and report rows
- End-to-end first-pass validation persistence with a fake collector

## Verification Completed

Executed successfully in this workspace state:

```bash
npm run build
npm test
npm run lint
node dist/src/db.js --migrate --db /tmp/fetch-trends-smoke.sqlite
```

Notes:

- `npm run db` uses `tsx`, which attempts to open a local IPC pipe. In this execution environment that wrapper can fail with a local permission error unrelated to application logic.
- The compiled JS entrypoint `node dist/src/db.js ...` verified the migration command behavior successfully.

## Known Gaps Left Intentionally

Not implemented in this slice:

- Optional `--db` persistence on `autocomplete`
- AI normalization or AI report generation
- External collectors beyond autocomplete
- Queue/worker execution
- Report regeneration command
- Web UI

Those remain aligned with the original plan’s next phases.
