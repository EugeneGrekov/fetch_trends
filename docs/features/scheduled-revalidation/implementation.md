# Scheduled Revalidation Implementation

## What Was Added

Scheduled revalidation now supports local stale-evidence scanning, queueing, pending-task execution, refreshed score/report snapshots, and non-fatal blocked/skipped collector outcomes.

Implemented components:

- SQLite migration `005_scheduled_revalidation_tables`.
- Tables: `revalidation_rules`, `revalidation_queue`, `revalidation_runs`.
- Repository helpers in `src/db/repositories/revalidation.ts`.
- Staleness rules in `src/revalidation/stale-evidence.ts`.
- Queue grouping and duplicate-open-task prevention in `src/revalidation/queue.ts`.
- Scanner in `src/revalidation/scheduler.ts`.
- Runner and fake/live service boundaries in `src/revalidation/revalidation-runner.ts`.
- Revalidation report generation in `src/revalidation/revalidation-report.ts`.
- CLI entrypoint: `npm run revalidate`.
- Tests using temp SQLite databases and fake services only.

## Staleness Rules

Default evidence freshness:

- Autocomplete predictions: stale after 90 days.
- SERP sources: stale after 30 days.
- Competitor pricing/positioning: stale after 30 days.
- Review/forum/complaint sources: stale after 90 days.
- Measurement events: never automatically stale.
- Scores and reports: refreshed when new evidence exists or evidence refresh tasks are queued.

Staleness reduces confidence and queues work. It does not delete or overwrite historical rows.

## Queue Behavior

Queued task types:

- `refresh_autocomplete`
- `refresh_serp`
- `refresh_competitors`
- `refresh_reviews`
- `refresh_measurement`
- `refresh_score`
- `refresh_report`
- `refresh_portfolio`

Queue statuses:

- `pending`
- `running`
- `completed`
- `failed`
- `skipped`
- `blocked`

The scanner avoids creating another pending/running task for the same idea and task type. Completed, failed, skipped, or blocked historical queue rows remain as lifecycle history.

## How To Run

Scan all recent ideas and queue stale work:

```bash
npm run revalidate -- --scan
```

Run pending queue items:

```bash
npm run revalidate -- --run-pending
```

Scan and run one idea:

```bash
npm run revalidate -- --idea-id 1
```

Scan all ideas and queue portfolio refresh markers for stale ideas:

```bash
npm run revalidate -- --portfolio
```

Use a specific database:

```bash
npm run revalidate -- --db ./data/fetch-trends.sqlite --scan
```

## Runner Behavior

The runner appends new rows:

- Fresh autocomplete predictions are inserted into `autocomplete_predictions`.
- Fresh source rows are inserted into `sources`.
- Extracted complaint/payment evidence is inserted into `evidence`.
- Fresh competitor rows are inserted into `competitors`.
- Refreshed scores are inserted into `scores` with `score_type = "revalidation_search_language"`.
- Revalidation reports are inserted into `reports` with `report_type = "revalidation_report"`.

Existing evidence, scores, reports, and decisions are preserved.

## Collector Availability

The default CLI wires local autocomplete revalidation through the existing Playwright autocomplete utility.

SERP, competitor, and review refreshes use injectable service boundaries. When a service is not configured, the task is marked `blocked` instead of crashing the run. Tests inject fake services and do not call live external systems.

## Current Limitations

- No daemon or cloud scheduler is included.
- No email, push notification, or multi-user assignment exists.
- Portfolio ranking is not implemented in this checkout, so `refresh_portfolio` is a queued marker that the runner skips with an explanatory message.
- Revalidation reports state portfolio rank changes as not calculated.
- External SERP/review/competitor live refresh services are intentionally boundary-based and require explicit implementation or injection.
