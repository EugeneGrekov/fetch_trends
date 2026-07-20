# Command Reference

## Safety Legend

| Field | Meaning |
|---|---|
| Live services | Whether the command can call network services, Codex, or browser-backed Google pages. |
| SQLite writes | Whether the command can create or mutate SQLite rows. |
| File outputs | Whether the command writes generated local files. |

Default tests and release checks must not call live external APIs, payment providers, Search Console, analytics services, or live Codex.

## Research

### `npm run autocomplete`

- Purpose: collect Google Autocomplete predictions for seed phrases.
- Example: `npm run autocomplete -- --seed "find my parked car" --country US --language en --depth 1`
- Inputs: `--seed`, `--seeds`, `--country`, `--language`, `--depth`, `--mode organic|modifier`, optional `--includeDigits`, explicit modifiers for modifier mode, browser/headless controls, optional output path, resume controls.
- Outputs: returned-prediction CSV, JSON, Markdown, summary CSV/JSON, and `.resume.json` near the requested output.
- Live services: yes. Uses Playwright against Google Autocomplete pages and stops rather than bypassing CAPTCHA or anti-bot pages.
- SQLite writes: no.
- File outputs: yes, defaulting to `./results/<local-date>_<time>_<first-word>.csv` when `--out` is omitted.

### `npm run validate`

- Purpose: run the local validation pipeline from idea text to persisted score and report.
- Example: `npm run validate -- --idea "automatic app that saves parking location when Bluetooth disconnects" --ai false`
- Inputs: `--idea`, DB/output path options, autocomplete options, AI options, and external collector flags.
- Outputs: SQLite rows, autocomplete artifacts under `./results/validate`, reports, and optional AI artifacts.
- Live services: yes by default because autocomplete collection is live; AI can call local Codex when enabled; external collectors can call provider-backed services only when explicitly enabled.
- SQLite writes: yes.
- File outputs: yes.

## Evidence And Reports

### `npm run report`

- Purpose: read the latest stored report by idea ID or job ID.
- Example: `npm run report -- --job-id 1 --format json`
- Inputs: `--idea-id` or `--job-id`, `--format markdown|json`, optional `--db`, optional `--out`.
- Outputs: report content to stdout or a file.
- Live services: no.
- SQLite writes: no, but the command applies pending migrations before reading.
- File outputs: only when `--out` is passed.

### `npm run payment-test`

- Purpose: generate a payment-intent test spec from stored validation evidence.
- Example: `npm run payment-test -- --idea-id 1`
- Inputs: `--idea-id`, optional `--db`, optional `--outDir`.
- Outputs: `payment-test.md`, `payment-test.json`, and a stored `payment_test_spec` report.
- Live services: no.
- SQLite writes: yes.
- File outputs: yes, defaulting to `./artifacts/ideas/<idea-id>/`.

### `npm run seo-plan`

- Purpose: generate an evidence-backed SEO page plan from stored validation evidence.
- Example: `npm run seo-plan -- --idea-id 1`
- Inputs: `--idea-id`, optional `--db`, optional `--outDir`.
- Outputs: `seo-plan.md`, `seo-plan.json`, and a stored `seo_plan` report.
- Live services: no.
- SQLite writes: yes.
- File outputs: yes, defaulting to `./artifacts/ideas/<idea-id>/`.

## Measurement And Decisions

### `npm run measurement`

- Purpose: create measurement experiments, import manual experiment events, record single events, and evaluate thresholds.
- Example: `npm run measurement -- --idea-id 1 --create`
- Inputs: experiment IDs, idea/report IDs, event CSVs, manual event fields, `--evaluate`, optional `--db`, optional `--outDir`.
- Outputs: experiment rows, event rows, measurement snapshots, measurement reports, and markdown/JSON artifacts.
- Live services: no.
- SQLite writes: yes.
- File outputs: yes when evaluating.

### `npm run decide`

- Purpose: generate a pivot/persevere decision memo from stored validation and measurement evidence.
- Example: `npm run decide -- --idea-id 1`
- Inputs: `--idea-id` or `--experiment-id`, optional `--db`, optional `--outDir`.
- Outputs: decision row, `decision_memo` report, and markdown/JSON artifacts.
- Live services: no.
- SQLite writes: yes.
- File outputs: yes, defaulting to `./artifacts/ideas/<idea-id>/`.

## Maintenance

### `npm run db`

- Purpose: apply local SQLite migrations.
- Example: `npm run db -- --migrate`
- Inputs: optional `--db`, required `--migrate`.
- Outputs: migration status on stdout.
- Live services: no.
- SQLite writes: yes.
- File outputs: creates or updates the SQLite DB file.

### `npm run revalidate`

- Purpose: scan for stale evidence, queue local revalidation tasks, and run pending revalidation tasks when available in the current checkout.
- Example: `npm run revalidate -- --scan --idea-id 1`
- Inputs: `--scan`, `--run-pending`, `--idea-id`, `--portfolio`, DB/output path options, and autocomplete refresh options.
- Outputs: revalidation queue/run rows, refreshed evidence/report rows, and optional autocomplete refresh artifacts.
- Live services: scan mode no; run-pending can call Google Autocomplete for refresh tasks.
- SQLite writes: yes.
- File outputs: yes when run-pending writes refresh artifacts.

### `npm run portfolio`

- Purpose: compare multiple stored ideas by evidence strength, risk, cost to test, and next action.
- Example: `npm run portfolio -- --limit 10 --outDir ./artifacts/portfolio`
- Inputs: optional `--db`, optional `--outDir`, optional `--status`, optional `--limit`, and `--include-killed`.
- Outputs: portfolio comparison markdown/JSON artifacts and a stored `portfolio_comparison` report.
- Live services: no.
- SQLite writes: yes.
- File outputs: yes, defaulting to `./artifacts/portfolio`.

### `npm run export-data`

- Purpose: export one idea bundle or a portfolio summary from local SQLite data.
- Example: `npm run export-data -- --idea-id 1 --format json --out ./exports/idea-1.json`
- Inputs: `--idea-id` or `--portfolio`, `--format json|markdown`, `--out`, `--redaction none|basic|strict`, optional `--db`, optional `--limit`, optional `--artifacts-root`.
- Outputs: JSON or Markdown export bundle files or stdout.
- Live services: no.
- SQLite writes: no, but the command applies pending migrations before reading.
- File outputs: yes when `--out` is passed.

### `npm run backup`

- Purpose: create a timestamped local backup of the SQLite database and selected artifact directories.
- Example: `npm run backup -- --out ./backups`
- Inputs: optional `--db`, `--out`, `--artifacts-dir`, `--reports-dir`, and `--timestamp`.
- Outputs: backup directory with copied database, copied artifacts, and `manifest.json`.
- Live services: no.
- SQLite writes: no, but the command reads the local DB file.
- File outputs: yes.

### `npm run restore`

- Purpose: restore a verified local backup into a target SQLite database and optional artifact directories.
- Example: `npm run restore -- --backup ./backups/fetch-trends-2026-07-07T120000Z --target-db ./data/restored.sqlite`
- Inputs: `--backup`, `--target-db`, optional `--target-artifacts-dir`, optional `--target-reports-dir`, and `--force`.
- Outputs: restored database and optional restored artifact directories.
- Live services: no.
- SQLite writes: yes, to the explicit target DB when restoration succeeds.
- File outputs: yes, to the explicit target paths.

### `npm run diagnose`

- Purpose: run local operator diagnostics without exposing secrets.
- Example: `npm run diagnose -- --json`
- Inputs: optional `--db`, `--json`, `--out`, `--live`, `--resultsDir`, and `--artifactsDir`.
- Outputs: Markdown or JSON diagnostic report.
- Live services: no by default; `--live` is reserved for explicit future live probes.
- SQLite writes: no.
- File outputs: only when `--out` is passed.

## App

### `npm run web`

- Purpose: start the local web interface.
- Example: `npm run web -- --port 3000 --ai false`
- Inputs: `--host`, `--port`, `--db`, `--outDir`, `--ai`, `--run-jobs`.
- Outputs: local HTTP server and web-triggered validation artifacts.
- Live services: startup no; submitted jobs can call Google Autocomplete and optional Codex/external collectors based on job settings.
- SQLite writes: yes when users submit or run jobs.
- File outputs: yes when jobs run.

### `npm run worker`

- Purpose: process pending validation jobs from SQLite.
- Example: `npm run worker -- --limit 1 --ai false`
- Inputs: `--db`, `--outDir`, `--limit`, `--ai`.
- Outputs: completed validation jobs, stored reports, and artifacts.
- Live services: yes when pending jobs run autocomplete; AI can call Codex when enabled.
- SQLite writes: yes.
- File outputs: yes.

## Build, Test, And Release

### `npm run test`

- Purpose: run the Vitest suite once.
- Example: `npm run test`
- Inputs: none by default.
- Outputs: test result summary.
- Live services: no by project rule.
- SQLite writes: temp/test-local only.
- File outputs: no committed outputs.

### `npm run test:watch`

- Purpose: run Vitest in watch mode for local development.
- Example: `npm run test:watch`
- Inputs: none by default.
- Outputs: interactive test results.
- Live services: no by project rule.
- SQLite writes: temp/test-local only.
- File outputs: no committed outputs.

### `npm run build`

- Purpose: type-check and compile TypeScript to `dist/`.
- Example: `npm run build`
- Inputs: TypeScript source files.
- Outputs: compiled JavaScript under `dist/`.
- Live services: no.
- SQLite writes: no.
- File outputs: yes, generated `dist/`.

### `npm run lint`

- Purpose: run ESLint.
- Example: `npm run lint`
- Inputs: repository source files covered by ESLint config.
- Outputs: lint result summary.
- Live services: no.
- SQLite writes: no.
- File outputs: no.

### `npm run release:check`

- Purpose: run local release verification.
- Example: `npm run release:check`
- Inputs: package metadata, docs, local Codex skills, built bin paths, and a temp SQLite DB.
- Outputs: pass/warn/fail summary.
- Live services: no. If `npm run diagnose` exists, it is called with `--json` and a migrated temp DB.
- SQLite writes: temp DB only.
- File outputs: temp files only.

### `npm run roadmap:check`

- Purpose: run offline roadmap governance verification.
- Example: `npm run roadmap:check`
- Inputs: roadmap governance docs, phase templates, implementation notes, and implementation order.
- Outputs: pass/warn/fail summary with plan, implementation-note, missing-document, and warning counts.
- Live services: no.
- SQLite writes: no.
- File outputs: no.

### `npm run backlog:check`

- Purpose: run offline backlog prioritization documentation checks.
- Example: `npm run backlog:check`
- Inputs: `docs/governance/backlog-prioritization.md`, `docs/governance/templates/backlog-item.md`, and optionally `--file docs/backlog/<item>.md`.
- Outputs: pass/fail summary with checked-file, missing-document, and warning counts.
- Live services: no.
- SQLite writes: no.
- File outputs: no.

### `npm run package:local`

- Purpose: build a local package directory for inspection or handoff.
- Example: `npm run package:local -- --out ./dist-package/fetch-trends`
- Inputs: built `dist/`, package metadata, README, docs, prompts, nonsecret config, and `.codex/skills`.
- Outputs: local directory under the requested `--out` path.
- Live services: no.
- SQLite writes: no.
- File outputs: yes, under `./dist-package/`.
