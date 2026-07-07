# Compare Idea Portfolio

## When To Use

Use this when you have several validated ideas and need to decide which one deserves the next experiment.

## Prerequisites

- Each idea has already been run through validation.
- You have the idea IDs printed by validation or visible in the local web UI.
- You are comparing evidence quality and next action, not estimating market size.

## Commands

```bash
npm run db -- --migrate
mkdir -p ./artifacts/portfolio
npm run report -- --idea-id <idea-id-1> --format json --out ./artifacts/portfolio/idea-<idea-id-1>.json
npm run report -- --idea-id <idea-id-2> --format json --out ./artifacts/portfolio/idea-<idea-id-2>.json
npm run report -- --idea-id <idea-id-3> --format json --out ./artifacts/portfolio/idea-<idea-id-3>.json
npm run web -- --run-jobs false --ai false
```

Open the local web URL printed by `npm run web` to review the same stored ideas visually.

## Expected Outputs

- One JSON report file per idea under `./artifacts/portfolio/`.
- A local web dashboard that reads from the same SQLite database.
- Comparable report fields for score, decision, top predictions, missing proof, and next action.

## How To Read The Result

Rank ideas by the strength of evidence, not by excitement. Prefer ideas with repeated problem or purchase language, clear missing-proof next steps, and fewer red flags. A higher score is only a local signal and does not replace pricing, SERP, customer, or launch evidence.

## Failure Handling

- If a report is missing, run the validation recipe for that idea first.
- If the web UI shows no data, confirm it is using the same `--db` path as validation.
- If all ideas look weak, rewrite the customer problem phrases before collecting more evidence.
- If one idea has external evidence and another does not, compare that difference explicitly instead of treating the scores as equivalent.

## Next Step

For the highest-ranked idea, generate a payment-intent experiment with [Run Payment Test](./run-payment-test.md).
