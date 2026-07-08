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
npm run portfolio -- --status active --limit 20
```

The command writes a Markdown and JSON comparison report under `./artifacts/portfolio/`.

## Expected Outputs

- A portfolio comparison Markdown file.
- A portfolio comparison JSON file.
- Comparable report fields for score, bucket, confidence, missing proof, and next action.

## How To Read The Result

Rank ideas by the strength of evidence, not by excitement. Prefer ideas with repeated problem or purchase language, clear missing-proof next steps, and fewer red flags. A higher score is only a local signal and does not replace pricing, SERP, customer, or launch evidence.

## Failure Handling

- If the report is missing, run the validation recipe for the ideas first.
- If all ideas look weak, rewrite the customer problem phrases before collecting more evidence.
- If one idea has external evidence and another does not, compare that difference explicitly instead of treating the scores as equivalent.

## Next Step

For the highest-ranked idea, generate a payment-intent experiment with [Run Payment Test](./run-payment-test.md).
