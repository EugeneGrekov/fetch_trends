# Post-Launch Measurement Plan

## Goal

After payment-test and SEO outputs exist, add a measurement layer that records real user behavior from launched validation experiments and compares it against the experiment thresholds.

This phase moves the product from proxy validation toward behavioral validation.

Core rule:

```text
Proxy evidence suggests what to test.
Post-launch measurement records what users actually do.
Decisions must be based on behavior, not optimism.
```

## Prerequisite

Complete and verify:

```text
docs/features/payment-test-and-seo/plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- Payment-test specs.
- SEO page plans.
- Experiment thresholds.
- SQLite-backed ideas, reports, scores, and artifacts.
- Local web interface.
- Report export.

## Non-Goals

Do not add these in this phase:

- Real payment processing.
- Public analytics SDK hosting.
- Search Console OAuth setup.
- Google Analytics integration.
- Email delivery automation.
- Refund automation.
- Multi-user dashboards.

This phase stores and evaluates measurement data. It does not operate a production analytics stack.

## Target Structure

Create:

```text
src/measurement/
  event-recorder.ts
  metrics-aggregator.ts
  threshold-evaluator.ts
  decision-report.ts
  types.ts

src/commands/
  measurement.ts

prompts/
  measurement-summary.md
  pivot-persevere-recommendation.md
```

Optional web additions:

```text
src/web/routes/measurements.ts
src/web/views/measurement-dashboard.ts
```

Optional docs:

```text
docs/features/post-launch-measurement/implementation.md
```

## Implementation Steps

### Step 1: Add Measurement Tables

Add SQLite tables for validation experiment data.

Recommended initial tables:

```text
experiments
experiment_events
measurement_snapshots
experiment_decisions
```

### Step 2: Add Event Recording

Support manual or file-based event recording before adding live integrations.

Events:

```text
page_view
pricing_view
cta_click
preview_start
preview_complete
checkout_start
payment_click
email_submit
reply_received
refund_requested
support_contact
```

Every event should include:

- Experiment ID.
- Event name.
- Timestamp.
- Source.
- Optional session ID.
- Optional metadata JSON.

### Step 3: Add Metrics Aggregation

Aggregate events into useful validation metrics:

- Visitors.
- CTA click rate.
- Preview-start rate.
- Preview-complete rate.
- Checkout-start rate.
- Payment-click rate.
- Email-submit rate.
- Reply rate.
- Refund count.
- Support-contact rate.

These are behavior signals, not final business proof.

### Step 4: Add Threshold Evaluation

Compare observed metrics against thresholds generated in the payment-test phase.

Each threshold result should classify as:

```text
strong_signal
weak_signal
kill_signal
inconclusive
```

The evaluator must explain which event data supports the classification.

### Step 5: Add Decision Report

Generate a measurement report with:

- Experiment summary.
- Event totals.
- Funnel metrics.
- Threshold comparison.
- Strong signals.
- Weak signals.
- Missing data.
- Recommended decision.

Decision values:

```text
continue_test
build_mvp
validate_deeper
pivot
kill
inconclusive
```

### Step 6: Add CLI Command

Add:

```bash
npm run measurement -- --experiment-id <id> --evaluate
```

Add manual event import:

```bash
npm run measurement -- --experiment-id <id> --events ./data/events.csv
```

Optional:

```bash
npm run measurement -- --idea-id <id> --latest
```

### Step 7: Add Web Dashboard Link

If the web UI exists, add a measurement view from:

- Idea dashboard.
- Report page.
- Payment-test spec page.

The view should show:

- Funnel.
- Threshold status.
- Decision recommendation.
- Missing data.

## Data / API / CLI Contracts

### `experiments`

Stores launched validation experiments.

```sql
CREATE TABLE experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  idea_id INTEGER NOT NULL,
  report_id INTEGER,
  experiment_type TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL,
  threshold_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  launched_at TEXT,
  completed_at TEXT,
  FOREIGN KEY (idea_id) REFERENCES ideas(id),
  FOREIGN KEY (report_id) REFERENCES reports(id)
);
```

### `experiment_events`

Stores raw behavior events.

```sql
CREATE TABLE experiment_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  experiment_id INTEGER NOT NULL,
  event_name TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  source TEXT NOT NULL,
  session_id TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (experiment_id) REFERENCES experiments(id)
);
```

### `measurement_snapshots`

Stores aggregate metric snapshots.

```sql
CREATE TABLE measurement_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  experiment_id INTEGER NOT NULL,
  metrics_json TEXT NOT NULL,
  threshold_results_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (experiment_id) REFERENCES experiments(id)
);
```

### `experiment_decisions`

Stores decision snapshots.

```sql
CREATE TABLE experiment_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  experiment_id INTEGER NOT NULL,
  decision TEXT NOT NULL,
  reason TEXT NOT NULL,
  report_id INTEGER,
  created_at TEXT NOT NULL,
  FOREIGN KEY (experiment_id) REFERENCES experiments(id),
  FOREIGN KEY (report_id) REFERENCES reports(id)
);
```

### Event CSV Format

Manual import should support:

```text
event_name,occurred_at,source,session_id,metadata_json
page_view,2026-07-07T10:00:00.000Z,manual,s1,{}
cta_click,2026-07-07T10:01:00.000Z,manual,s1,{}
```

## Testing Plan

Add tests for:

- Event CSV parsing.
- Event insertion.
- Metrics aggregation.
- Threshold evaluation.
- Decision report generation.
- Empty event set behavior.
- Missing experiment behavior.
- Web route rendering if web routes are added.

Default tests must not call:

- Live analytics services.
- Search Console.
- Payment providers.
- Live Codex.

Use fixtures and temp SQLite databases.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

Optional manual smoke test:

```bash
npm run measurement -- --experiment-id <id> --events ./data/example-events.csv
npm run measurement -- --experiment-id <id> --evaluate
```

## Acceptance Criteria

- Measurement tables exist.
- Experiment events can be recorded.
- Manual CSV event import works.
- Metrics can be aggregated.
- Thresholds can be evaluated.
- Measurement report can be stored.
- Decision recommendation is generated from observed behavior.
- Empty or weak data produces `inconclusive`, not fake confidence.
- Default tests do not call external services.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Tiny sample sizes can create false confidence.
- Manual imports can contain bad data.
- Thresholds may be unrealistic.
- Users may treat fake-door clicks as payment proof.
- Measurement can drift away from the original idea/report.

Mitigations:

- Store raw events.
- Keep thresholds explicit.
- Mark low sample sizes as inconclusive.
- Include missing-data warnings.
- Link every experiment back to idea and report IDs.

## Recommended Next Phase

After post-launch measurement exists, add a decision loop that turns measurement reports into repeatable pivot, persevere, or kill workflows:

```text
docs/features/pivot-persevere-loop/plan.md
```
