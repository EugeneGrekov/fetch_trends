# Revalidate Stale Evidence

## When To Use

Use this when an older idea needs fresh search-language evidence before you trust a decision or rerun a portfolio comparison.

## Prerequisites

- The original idea wording or current positioning is known.
- You have the old idea ID for exporting the previous report.
- You understand that this manual refresh creates a new validation run from the current CLI rather than adding new scoring logic.

## Commands

```bash
npm run db -- --migrate
mkdir -p ./artifacts/revalidation
npm run report -- --idea-id <old-idea-id> --format json --out ./artifacts/revalidation/before-idea-<old-idea-id>.json
npm run validate -- --idea "automatic app that saves parking location when Bluetooth disconnects" --ai false --external false --outDir ./results/revalidate
npm run report -- --idea-id <new-or-updated-idea-id> --format markdown --out ./artifacts/revalidation/latest-idea-<new-or-updated-idea-id>.md
```

Use the idea ID printed by the fresh validation run for the final report export.

## Expected Outputs

- A JSON snapshot of the older report.
- Fresh autocomplete artifacts under `./results/revalidate/`.
- A fresh stored validation report.
- A Markdown export of the latest report for comparison.

## How To Read The Result

Compare old and fresh reports for changes in query language, intent mix, missing proof, and next action. This does not prove trend growth or decline. It only shows whether the visible autocomplete wording changed enough to affect the next validation step.

## Failure Handling

- If the old report is missing, confirm the idea ID or use the web UI to locate the idea.
- If the refreshed run creates a new idea record, compare the two exported reports manually.
- If autocomplete collection is blocked, wait and rerun later rather than trying to bypass Google protections.
- If the refreshed report contradicts the old report, prefer a new measurement or customer test before changing a build decision.

## Next Step

Use the refreshed report in [Compare Idea Portfolio](./compare-idea-portfolio.md).
