# Run Payment Test

## When To Use

Use this after validation finds enough evidence to justify testing payment intent or SEO demand with a lightweight artifact.

## Prerequisites

- The idea has a stored `search-language-validation` report.
- You know the idea ID.
- You have reviewed the validation report and accepted its missing-proof caveats.

## Commands

```bash
npm run db -- --migrate
npm run payment-test -- --idea-id <idea-id>
npm run seo-plan -- --idea-id <idea-id>
npm run report -- --idea-id <idea-id> --format markdown --out ./artifacts/ideas/<idea-id>/latest-report.md
```

## Expected Outputs

- `./artifacts/ideas/<idea-id>/payment-test.md`
- `./artifacts/ideas/<idea-id>/payment-test.json`
- `./artifacts/ideas/<idea-id>/seo-plan.md`
- `./artifacts/ideas/<idea-id>/seo-plan.json`
- Stored `payment_test_spec` and `seo_plan` report rows in SQLite.

## How To Read The Result

The payment-test spec proposes a conservative experiment, threshold assumptions, and what signal should change the decision. The SEO plan turns stored search language into page and positioning ideas. Neither artifact proves that users will buy; it only defines the next measurable test.

## Failure Handling

- If `payment-test` says no validation report exists, run validation for the idea first.
- If the generated threshold assumptions look too aggressive, edit the launched experiment externally and keep the measured events honest.
- If the SEO plan repeats low-intent language, return to validation with clearer customer problem wording.
- If artifacts are written to a custom directory, pass the same `--outDir` to later commands when needed.

## Next Step

After launching the experiment, measure behavior with [Measure Experiment](./measure-experiment.md).
