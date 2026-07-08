# SQLite Foundation Plan

## Goal

After the autocomplete utility refactor is complete, add the local SQLite persistence foundation needed for evidence-backed validation.

This phase should make the project capable of storing ideas, validation jobs, tool runs, autocomplete evidence, scores, and reports.

## Prerequisite

Complete and verify:

```text
docs/features/autocomplete-refactor/plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

## Non-Goals

Do not add these in this phase:

- Web UI.
- Codex skills.
- External SERP/Reddit/YouTube collectors.
- Full AI report generation.
- Payment-test landing page generation.
- Complex background queue.

The focus is local persistence and the first stored validation path.

## Step 1: Choose SQLite Library

Recommended default:

```text
better-sqlite3
```

Reason:

- Simple local-first usage.
- Synchronous API is acceptable for local CLI workflows.
- Easy transaction handling.
- Good fit for a single-user local tool.

If async DB access becomes important later, revisit this choice.

## Step 2: Add DB Module

Create:

```text
src/db/
  connection.ts
  migrations.ts
  schema.ts
  repositories/
    ideas.ts
    jobs.ts
    tool-runs.ts
    queries.ts
    autocomplete-predictions.ts
    scores.ts
    reports.ts
```

Responsibilities:

| File | Responsibility |
|---|---|
| `connection.ts` | Open SQLite database and resolve DB path. |
| `migrations.ts` | Apply local migrations safely and idempotently. |
| `schema.ts` | Shared table/type definitions if useful. |
| `repositories/*` | Typed CRUD helpers for each persistence area. |

## Step 3: DB Path Configuration

Support environment override:

```text
FETCH_TRENDS_DB_PATH
```

Default path:

```text
./data/fetch-trends.sqlite
```

Rules:

- Ensure parent directory exists.
- Do not store the SQLite file in `dist/`.
- Do not require external services.

## Step 4: Initial Schema

Start with only the tables needed for autocomplete-backed validation.

### `ideas`

Stores user-submitted ideas and optional normalized metadata.

```sql
CREATE TABLE ideas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  raw_description TEXT NOT NULL,
  normalized_json TEXT,
  target_market TEXT,
  platform TEXT,
  expected_price TEXT,
  business_model TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### `jobs`

Stores validation job lifecycle.

```sql
CREATE TABLE jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id INTEGER NOT NULL,
  job_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT,
  completed_at TEXT,
  error_message TEXT,
  FOREIGN KEY (idea_id) REFERENCES ideas(id)
);
```

### `tool_runs`

Stores each utility or analysis execution.

```sql
CREATE TABLE tool_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  tool_name TEXT NOT NULL,
  input_json TEXT NOT NULL,
  output_json TEXT,
  metadata_json TEXT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_message TEXT,
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
```

### `queries`

Stores generated or discovered search queries.

```sql
CREATE TABLE queries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id INTEGER NOT NULL,
  query TEXT NOT NULL,
  normalized_query TEXT NOT NULL,
  intent_type TEXT,
  source TEXT NOT NULL,
  priority_score INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (idea_id) REFERENCES ideas(id)
);
```

### `autocomplete_predictions`

Stores autocomplete evidence.

```sql
CREATE TABLE autocomplete_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id INTEGER NOT NULL,
  query_id INTEGER,
  prediction TEXT NOT NULL,
  normalized_prediction TEXT NOT NULL,
  intent TEXT NOT NULL,
  confidence_score INTEGER NOT NULL,
  source_seed TEXT NOT NULL,
  source_prefix TEXT NOT NULL,
  country TEXT NOT NULL,
  language TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (idea_id) REFERENCES ideas(id),
  FOREIGN KEY (query_id) REFERENCES queries(id)
);
```

### `scores`

Stores score snapshots.

```sql
CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id INTEGER NOT NULL,
  score_type TEXT NOT NULL,
  score_json TEXT NOT NULL,
  total_score INTEGER NOT NULL,
  decision TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (idea_id) REFERENCES ideas(id)
);
```

### `reports`

Stores generated reports.

```sql
CREATE TABLE reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id INTEGER NOT NULL,
  job_id INTEGER,
  report_type TEXT NOT NULL,
  markdown TEXT NOT NULL,
  json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (idea_id) REFERENCES ideas(id),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);
```

## Step 5: Migration Runner

Add a simple migration system.

Minimum behavior:

- Create a `schema_migrations` table.
- Apply migrations in order.
- Skip already-applied migrations.
- Run inside a transaction.
- Fail clearly on migration error.

Initial migration:

```text
001_initial_validation_tables
```

## Step 6: DB Command

Add a DB command once command structure exists:

```bash
npm run db -- --migrate
```

If command routing does not exist yet, use a direct script first:

```bash
tsx src/db/migrations.ts
```

Expected output:

```text
Applied 001_initial_validation_tables
Database ready: ./data/fetch-trends.sqlite
```

## Step 7: Persist Autocomplete Runs

Keep existing autocomplete CSV/JSON behavior unchanged.

Add optional persistence path:

```bash
npm run autocomplete -- --seed "find my parked car" --out ./results/parking.csv --db ./data/fetch-trends.sqlite
```

or defer the `--db` flag and persist only through the first `validate` command.

Recommended approach:

- Do not complicate `autocomplete` yet.
- Persist autocomplete evidence through `validate`.
- Keep `autocomplete` as a clean standalone research utility.

## Step 8: First Minimal `validate` Command

Create a first local validation command:

```bash
npm run validate -- --idea "automatic app that saves parking location when Bluetooth disconnects"
```

Minimal pipeline:

```text
input idea
  -> create idea row
  -> create job row
  -> generate initial seed queries
  -> run autocomplete utility
  -> store predictions
  -> create simple search-language score
  -> create Markdown report
```

This command does not need external SERP, Reddit, YouTube, or AI yet.

## Step 9: Basic Report From DB Evidence

Generate a simple Markdown report from stored evidence.

Initial sections:

- Idea.
- Target market.
- Query seeds.
- Top autocomplete predictions.
- Intent breakdown.
- Strongest high-intent queries.
- Problem-intent queries.
- Weak/low-intent queries.
- Initial score.
- Missing evidence.
- Next action.

The report must clearly say:

```text
This report validates search language only. It does not prove demand size or willingness to pay.
```

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

Add tests for:

- Migration runner against a temp SQLite file.
- Repository insert/read paths.
- Creating an idea.
- Creating a job.
- Storing autocomplete predictions.
- Creating a basic report row.

## Acceptance Criteria

- Existing autocomplete behavior still works.
- Local SQLite DB can be created.
- Migrations run idempotently.
- An idea can be stored.
- A validation job can be stored.
- Tool runs can be stored.
- Autocomplete predictions can be linked to an idea.
- A simple score can be stored.
- A basic Markdown report can be stored.
- Deterministic tests pass.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Adding persistence directly to the existing autocomplete command may overcomplicate the clean utility boundary.
- Schema should avoid over-modeling before external collectors exist.
- Scores and reports must be snapshots, not mutable truth.
- Raw evidence must be stored separately from interpretation.

## Recommended Next Phase

After SQLite foundation works, add the first AI runner phase:

```text
prompts/
src/ai/
```

Initial AI tasks:

- Normalize idea.
- Generate structured query groups.
- Draft report from stored autocomplete evidence.

AI should consume local JSON evidence and write structured output with metadata.
