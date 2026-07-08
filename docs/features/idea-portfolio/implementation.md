# Idea Portfolio Implementation

## Summary

Implemented a local portfolio comparison workflow that ranks multiple ideas by evidence quality, payment signal strength, recency, test cost, and next-action clarity.

The feature is evidence-first and decision-oriented:

- it produces practical buckets: `test_next`, `validate_deeper`, `watch`, `park`, and `kill`
- it keeps kill rules visible instead of hiding them inside the aggregate score
- it writes a Markdown and JSON comparison report from local SQLite data
- it exposes the workflow through `npm run portfolio`

## Files Changed

- `src/portfolio/types.ts`
- `src/portfolio/portfolio-loader.ts`
- `src/portfolio/portfolio-scorer.ts`
- `src/portfolio/portfolio-ranker.ts`
- `src/portfolio/comparison-report.ts`
- `src/portfolio/README.md`
- `src/commands/portfolio.ts`
- `src/portfolio.ts`
- `src/portfolio/portfolio-scorer.test.ts`
- `src/portfolio/comparison-report.test.ts`
- `src/portfolio/test-fixtures.ts`
- `src/commands/portfolio.test.ts`
- `prompts/portfolio-summary.md`
- `package.json`
- `docs/features/idea-portfolio/README.md`
- `docs/features/idea-portfolio/implementation.md`
- `docs/reference/architecture.md`
- `docs/reference/commands.md`
- `docs/governance/implementation-order.md`
- `docs/status/implemented-features.md`
- `docs/recipes/compare-idea-portfolio.md`

## Commands Added or Changed

- Added `npm run portfolio`
- Added package bin entry `fetch-trends-portfolio`
- Added CLI options:
  - `--db <path>`
  - `--outDir <path>`
  - `--status <status>`
  - `--limit <count>`
  - `--include-killed <boolean>`

## Schema/Migration Changes

None.

## Tests Added or Updated

- `src/portfolio/portfolio-scorer.test.ts`
- `src/portfolio/comparison-report.test.ts`
- `src/commands/portfolio.test.ts`

The tests cover:

- scoring with strong evidence
- scoring with missing evidence
- kill-rule override
- ranking order across buckets
- report rendering
- CLI execution against a temp SQLite database

## Verification Results

Passed:

```bash
npm test
npm run build
npm run lint
```

All three commands completed successfully in this checkout.

## Known Limitations

- Optional web dashboard support was not added.
- The ranking is heuristic and intentionally local; it is not a market-sizing model.
- The command uses the latest stored evidence and reports, so sparse histories can still produce coarse rankings.

## Follow-Up Work

- Add the optional `/portfolio` web view if the local dashboard needs a cross-idea table.
- Consider broader portfolio loading if a workspace grows beyond the current CLI defaults.
- Reuse the comparison report in future revalidation scheduling and export workflows.

## Plan Deviations

The plan listed an optional web dashboard. That was intentionally deferred in this implementation because the CLI and report outputs covered the required phase.
