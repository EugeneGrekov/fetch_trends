# Workflow Recipes

Use these recipes when you want an end-to-end path from intent to verified output without memorizing every command.

The recipes are practical operating guides. They do not add new validation logic, and they do not turn autocomplete or proxy behavior into demand proof.

| Recipe | When To Use | Command Sequence | Success Output |
|---|---|---|---|
| [Validate One Idea](./recipes/validate-one-idea.md) | Start from one rough idea and produce a validation report. | `db`, `validate`, `report` | Stored idea, score, report, and exported Markdown. |
| [Compare Idea Portfolio](./recipes/compare-idea-portfolio.md) | Compare several validated ideas before choosing the next test. | `db`, repeated `report`, `web` | JSON report exports and a local dashboard view. |
| [Run Payment Test](./recipes/run-payment-test.md) | Convert a validated idea into payment-test and SEO artifacts. | `db`, `payment-test`, `seo-plan`, `report` | Payment-test and SEO Markdown/JSON artifacts. |
| [Measure Experiment](./recipes/measure-experiment.md) | Import launch behavior and evaluate experiment thresholds. | `db`, `measurement --create`, `measurement --events`, `measurement --evaluate` | Stored events, measurement snapshot, and measurement report. |
| [Decide Pivot Or Persevere](./recipes/decide-pivot-or-persevere.md) | Turn stored evidence into one conservative decision memo. | `db`, `decide`, `report` | Decision row and decision memo artifacts. |
| [Revalidate Stale Evidence](./recipes/revalidate-stale-evidence.md) | Refresh old search-language evidence before trusting an older decision. | `db`, `report`, `validate`, `report` | Before/after report exports and fresh validation artifacts. |
| [Backup And Restore](./recipes/backup-and-restore.md) | Copy or restore local SQLite data and matching artifacts. | `db`, shell copy commands, `report` | Backup files and a successful restored report read. |
| [Diagnose Local Setup](./recipes/diagnose-local-setup.md) | Check install, browser, DB, build, tests, lint, and web startup. | `install`, Playwright install, `db`, `build`, `test`, `lint`, `web` | Passing local checks and a web URL. |

## Recommended Order

1. [Diagnose Local Setup](./recipes/diagnose-local-setup.md)
2. [Validate One Idea](./recipes/validate-one-idea.md)
3. [Compare Idea Portfolio](./recipes/compare-idea-portfolio.md)
4. [Run Payment Test](./recipes/run-payment-test.md)
5. [Measure Experiment](./recipes/measure-experiment.md)
6. [Decide Pivot Or Persevere](./recipes/decide-pivot-or-persevere.md)
7. [Revalidate Stale Evidence](./recipes/revalidate-stale-evidence.md)
8. [Backup And Restore](./recipes/backup-and-restore.md)

## Command Reference Check

Run the offline recipe checker after editing recipes:

```bash
npx tsx scripts/check-recipes.ts
```

The checker validates that recipe files exist, required headings are present, the index links every recipe, and every `npm run <script>` reference points to a script in `package.json`.
