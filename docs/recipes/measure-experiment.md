# Measure Experiment

## When To Use

Use this after a payment-intent or SEO experiment has launched and you have behavior events to import or record.

## Prerequisites

- The idea has a stored payment-test spec.
- You know the idea ID.
- Event data is available as a CSV file or as individual manual events.
- CSV files use `event_name`, `occurred_at`, and `source` headers, with optional `session_id` and `metadata_json`.

## Commands

```bash
npm run db -- --migrate
npm run measurement -- --create --idea-id <idea-id> --title "Parking reminder payment page"
npm run measurement -- --latest --idea-id <idea-id> --events ./data/measurement-events.csv
npm run measurement -- --latest --idea-id <idea-id> --event-name payment_click --source manual --occurred-at 2026-07-07T12:00:00Z
npm run measurement -- --latest --idea-id <idea-id> --evaluate
```

## Expected Outputs

- A stored experiment row linked to the idea and payment-test report.
- Stored experiment events from CSV and manual input.
- A measurement snapshot with aggregated metrics and threshold evaluation.
- `./artifacts/ideas/<idea-id>/measurement-experiment-<experiment-id>.md`
- `./artifacts/ideas/<idea-id>/measurement-experiment-<experiment-id>.json`

## How To Read The Result

Use the measurement report to compare observed behavior against the thresholds created by the payment-test spec. Strong events such as payment clicks or replies are still proxy signals unless actual payment collection is part of the experiment.

## Failure Handling

- If experiment creation fails, run `npm run payment-test -- --idea-id <idea-id>` first.
- If CSV import fails, check the required headers and event names.
- If evaluation is inconclusive, inspect missing data before changing the idea.
- If you record events manually, keep timestamps and sources traceable.

## Next Step

Turn the measured evidence into a decision memo with [Decide Pivot Or Persevere](./decide-pivot-or-persevere.md).
