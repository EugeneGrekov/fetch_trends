# Scheduled Revalidation Plan

## Goal

After portfolio comparison exists, add scheduled revalidation so stale evidence can be detected, follow-up validation jobs can be queued, and idea scores can be refreshed without manually restarting the whole pipeline.

This phase turns validation from a one-time report into a maintainable local research workflow.

Core rule:

```text
Evidence decays.
Revalidation refreshes evidence.
Automation should queue work, not hide uncertainty.
```

## Prerequisite

Complete and verify:

```text
docs/features/idea-portfolio/plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- Ideas.
- Validation jobs.
- External evidence collectors.
- Payment-test and SEO outputs.
- Measurement events and snapshots.
- Pivot/persevere decisions.
- Portfolio ranking.
- Local SQLite persistence.

## Non-Goals

Do not add these in this phase:

- Cloud scheduler.
- Email alerts.
- Push notifications.
- Multi-user assignment.
- Paid API budget optimization.
- Automatic production launch.
- Fully autonomous idea killing.

This phase is local scheduled/queued maintenance for validation data.

## Target Structure

Create:

```text
src/revalidation/
  stale-evidence.ts
  scheduler.ts
  queue.ts
  revalidation-runner.ts
  revalidation-report.ts
  types.ts

src/commands/
  revalidate.ts
```

Optional web additions:

```text
src/web/routes/revalidation.ts
src/web/views/revalidation-dashboard.ts
```

Optional prompt:

```text
prompts/revalidation-summary.md
```

## Implementation Steps

### Step 1: Define Staleness Rules

Classify evidence by age and source type.

Suggested defaults:

| Evidence Type | Stale After | Reason |
|---|---:|---|
| Autocomplete predictions | 90 days | Search language can shift. |
| SERP results | 30 days | Rankings and competitors change quickly. |
| Competitor pricing | 30 days | Pricing and offers change often. |
| Reviews/complaints | 90 days | Pain patterns evolve slower. |
| Measurement events | Never stale, but can become insufficient | Historical behavior remains factual. |
| Decisions | Never stale, but can be superseded | Decision history should persist. |

Staleness should reduce confidence, not delete evidence.

### Step 2: Add Revalidation Queue

Add a local queue of revalidation work.

Queue item types:

```text
refresh_autocomplete
refresh_serp
refresh_competitors
refresh_reviews
refresh_measurement
refresh_score
refresh_report
refresh_portfolio
```

Queue statuses:

```text
pending
running
completed
failed
skipped
blocked
```

### Step 3: Add SQLite Tables

Add tables if existing job tables are not enough.

Recommended:

```text
revalidation_rules
revalidation_queue
revalidation_runs
```

If existing `jobs` can represent the queue cleanly, use it instead and add only what is missing.

### Step 4: Add Scheduler

The scheduler should be local and explicit.

Supported modes:

```bash
npm run revalidate -- --scan
npm run revalidate -- --run-pending
npm run revalidate -- --idea-id <id>
npm run revalidate -- --portfolio
```

The first version does not need a daemon. A manual command is enough.

### Step 5: Add Revalidation Runner

Runner behavior:

```text
scan ideas
  -> find stale evidence or stale reports
  -> queue revalidation tasks
  -> run selected tasks
  -> store new evidence as new rows
  -> create new scores/reports
  -> preserve old evidence and reports
```

Do not overwrite old evidence.

### Step 6: Add Revalidation Report

Generate a report after a revalidation run.

Required sections:

- What was stale.
- What was refreshed.
- What failed or was skipped.
- New evidence found.
- Score changes.
- Decision changes.
- Portfolio rank changes.
- Recommended next action.

### Step 7: Optional Web Dashboard

If web UI integration is added, show:

- Stale ideas.
- Pending revalidation tasks.
- Last refreshed time.
- Failed tasks.
- Confidence decay.
- Re-run button.

Keep this optional in the first implementation.

## Data / API / CLI Contracts

### Staleness Result

```json
{
  "ideaId": 123,
  "stale": true,
  "reasons": [
    {
      "type": "serp_result",
      "lastFetchedAt": "2026-05-01T00:00:00.000Z",
      "staleAfterDays": 30,
      "recommendedTask": "refresh_serp"
    }
  ],
  "confidenceImpact": "medium"
}
```

### Queue Item

```json
{
  "ideaId": 123,
  "taskType": "refresh_serp",
  "status": "pending",
  "reason": "SERP evidence is older than 30 days."
}
```

### CLI

Scan only:

```bash
npm run revalidate -- --scan
```

Run pending:

```bash
npm run revalidate -- --run-pending
```

Single idea:

```bash
npm run revalidate -- --idea-id 123
```

Portfolio refresh:

```bash
npm run revalidate -- --portfolio
```

## Testing Plan

Add tests for:

- Staleness calculation by source type.
- Fresh evidence stays fresh.
- Stale evidence queues the right task.
- Queue task lifecycle.
- Revalidation runner with fake collectors.
- Revalidation report generation.
- Failed task handling.
- CLI scan mode with temp SQLite.
- CLI run-pending mode with fake services.

Default tests must not call:

- Live Google.
- Live SERP providers.
- Reddit/YouTube APIs.
- Live Codex.
- Payment providers.

Use fixture timestamps and fake collectors.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

Optional manual smoke test:

```bash
npm run revalidate -- --scan
```

## Acceptance Criteria

- Stale evidence detection exists.
- Revalidation queue exists or is represented clearly through existing jobs.
- CLI can scan for stale ideas.
- CLI can queue follow-up tasks.
- CLI can run pending tasks with fake/testable services.
- Revalidation creates new evidence/scores/reports instead of overwriting old records.
- Revalidation report is stored.
- Missing API keys produce non-fatal blocked/skipped tasks.
- Default tests do not call live external services.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Automated revalidation can burn API quota.
- Staleness rules may be too aggressive.
- Refreshing evidence can create duplicate rows.
- Users may trust refreshed scores without reading source changes.
- Failed external collectors can make revalidation noisy.

Mitigations:

- Manual scan/run commands first.
- Conservative default staleness windows.
- Store run metadata.
- Preserve old evidence for comparison.
- Mark blocked/skipped tasks clearly.

## Recommended Next Phase

After scheduled revalidation works, add data export and backup support:

```text
docs/features/data-export-and-backup/plan.md
```

That phase should let users export, archive, back up, and restore local validation evidence and reports.
