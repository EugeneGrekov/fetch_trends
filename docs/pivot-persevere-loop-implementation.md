# Pivot Persevere Loop Implementation

## What Was Implemented

The pivot/persevere loop adds a deterministic decision layer over stored validation and post-launch measurement evidence.

New capabilities:

- `src/decision-loop/decision-engine.ts` evaluates an idea or experiment into `build_mvp`, `persevere`, `pivot`, `validate_deeper`, `kill`, or `inconclusive`.
- `src/decision-loop/learning-history.ts` builds a chronological learning timeline for an idea.
- `src/decision-loop/pivot-generator.ts` generates up to three evidence-backed pivot options when the decision is `pivot`.
- `src/decision-loop/next-experiment.ts` returns exactly one concrete next action.
- `src/commands/decide.ts` persists a decision memo report and an idea-level decision row.
- `npm run decide -- --idea-id <id>` evaluates the latest experiment for an idea.
- `npm run decide -- --experiment-id <id>` evaluates a specific experiment.

## Persistence

Migration `004_pivot_persevere_loop_tables` adds `idea_decisions`.

Stored fields:

- `idea_id`
- `experiment_id`
- `report_id`
- `decision`
- `confidence`
- `reason`
- `evidence_json`
- `next_action`
- `created_at`

Decision memos are also stored as `reports.report_type = "decision_memo"` and written to:

```bash
./artifacts/ideas/<idea-id>/decision-memo-<report-id>.md
./artifacts/ideas/<idea-id>/decision-memo-<report-id>.json
```

## Decision Rules

The engine is conservative:

- Missing experiments, missing metrics, missing threshold comparisons, or zero events produce `inconclusive`.
- Visitor counts below the lowest stored threshold produce `inconclusive`, even when clicks look promising.
- Strong threshold matches produce `build_mvp`.
- Kill threshold matches produce `kill`.
- Engagement with no payment-intent or reply behavior plus narrower evidence produces `pivot`.
- Engagement that passed the first sample floor but has not reached the strongest threshold produces `persevere`.
- Weak follow-up behavior produces `validate_deeper`.

## How To Run

Evaluate the latest experiment for an idea:

```bash
npm run decide -- --idea-id 1
```

Evaluate one experiment:

```bash
npm run decide -- --experiment-id 10
```

Use a specific database and artifact directory:

```bash
npm run decide -- --db ./data/fetch-trends.sqlite --idea-id 1 --outDir ./artifacts/ideas
```

## Testing

Added tests cover:

- `build_mvp` from strong measurement evidence.
- `pivot` from mixed behavior plus narrower evidence.
- `kill` from a kill threshold.
- `inconclusive` from low sample size.
- Learning history generation.
- Pivot option generation.
- Decision memo report and decision-row persistence with temp SQLite.

Default tests use fixtures and temp SQLite only.
