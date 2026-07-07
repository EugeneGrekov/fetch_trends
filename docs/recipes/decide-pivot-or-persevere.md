# Decide Pivot Or Persevere

## When To Use

Use this when validation and measurement evidence should become one conservative build, pivot, or kill decision.

## Prerequisites

- The idea has a validation report.
- Ideally, the idea also has a payment-test spec and measurement report.
- You know the idea ID or the experiment ID.

## Commands

```bash
npm run db -- --migrate
npm run decide -- --idea-id <idea-id>
npm run decide -- --experiment-id <experiment-id>
npm run report -- --idea-id <idea-id> --format markdown --out ./artifacts/ideas/<idea-id>/decision-memo.md
```

Run either the idea command or the experiment command. The example shows both selection styles.

## Expected Outputs

- A decision printed to stdout with confidence, reason, and next action.
- A stored `decision_memo` report.
- A stored idea decision row.
- `./artifacts/ideas/<idea-id>/decision-memo-<report-id>.md`
- `./artifacts/ideas/<idea-id>/decision-memo-<report-id>.json`

## How To Read The Result

The decision memo is a synthesis of stored evidence and missing proof. It should help choose the next action, not provide permission to ignore weak data. A pivot recommendation means the current evidence points elsewhere or lacks enough proof, not that the broader market is invalid.

## Failure Handling

- If the command asks for an idea or experiment ID, pass exactly one selector.
- If no measurement exists, the decision will rely more heavily on validation evidence and should be treated as lower confidence.
- If the next action feels too broad, go back to the measurement report and tighten the threshold or event definition.
- If prior decisions conflict, compare the learning history before overriding them.

## Next Step

If continuing, refresh aging evidence later with [Revalidate Stale Evidence](./revalidate-stale-evidence.md).
