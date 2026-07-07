# Validate One Idea

## When To Use

Use this when you have one rough micro-business idea and need a first evidence-backed validation report.

## Prerequisites

- Dependencies are installed with `npm install`.
- Chromium is installed for Playwright if the autocomplete collector has not run locally before.
- The idea can be described in one clear sentence.
- You accept that Google Autocomplete validates search language, not demand size.

## Commands

```bash
npm run db -- --migrate
npm run validate -- --idea "automatic app that saves parking location when Bluetooth disconnects" --ai false --external false
npm run report -- --idea-id <idea-id> --format markdown --out ./artifacts/ideas/<idea-id>/validation-report.md
```

Use the `idea-id` printed by the validation command in the report command.

## Expected Outputs

- A migrated SQLite database at `./data/fetch-trends.sqlite` unless `--db` or `FETCH_TRENDS_DB_PATH` is set.
- Autocomplete artifacts under `./results/validate/`.
- Stored rows for the idea, job, queries, predictions, score, report, and tool runs.
- A Markdown report at `./artifacts/ideas/<idea-id>/validation-report.md`.

## How To Read The Result

Treat the score and decision as search-language evidence. Strong purchase, comparison, and problem phrases mean the wording deserves deeper validation. They do not prove monthly volume, willingness to pay, or that the product should be built.

## Failure Handling

- If the browser cannot start, run `npx playwright install chromium`.
- If Google shows CAPTCHA or anti-bot pages, stop and retry later or use `--headless false` for manual inspection.
- If no predictions are collected, rewrite the idea in the customer's words and rerun with a narrower phrase.
- If the report command cannot find the idea, confirm the `idea-id` printed by validation.

## Next Step

Compare the idea against other validated ideas with [Compare Idea Portfolio](./compare-idea-portfolio.md).
