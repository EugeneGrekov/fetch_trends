# Fetch Trends

Local CLI for Google Autocomplete research around micro-business ideas.

This tool validates search language, not exact demand size. Autocomplete
predictions are not monthly search volume. Use Keyword Planner, Google Trends,
Search Console, or SEO tools after this step.

## What It Does

- Expands seed phrases into Google Autocomplete prefixes.
- Collects visible predictions through Playwright browser automation.
- Deduplicates predictions by normalized query.
- Classifies intent and platform.
- Scores signals without estimating volume.
- Exports CSV, JSON, partial resume data, and per-seed summaries.
- Can run an evidence-first AI pass that normalizes ideas, proposes bounded queries, summarizes stored evidence, and drafts a report from local artifacts only.

The collector uses delays, a clean browser context, and stops safely if Google
shows CAPTCHA or anti-bot pages. It does not bypass CAPTCHA or anti-bot systems.

## Install

```bash
npm install
```

If Chromium is not available locally:

```bash
npx playwright install chromium
```

## Usage

For end-to-end command sequences, see [Workflow Recipes](docs/workflows.md).

Single seed:

```bash
npm run autocomplete -- --seed "find my parked car" --country US --language en --depth 2 --out ./results/parking.csv
```

Batch file:

```bash
npm run autocomplete -- --seeds ./data/parking-seeds.txt --country US --language en --depth 2 --out ./results/parking.csv
```

Multiple seed files:

```bash
npm run autocomplete -- --seeds ./data/parking.txt --seeds ./data/maps.csv --out ./results/mobility.csv
```

Pasted stdin:

```bash
pbpaste | npm run autocomplete -- --seeds - --out ./results/pasted.csv
```

Batch inline:

```bash
npm run autocomplete -- --seed "find my parked car" --seed "automatic parking location app" --seed "Bluetooth parking location app Android" --country US --language en --depth 2 --out ./results/parking.csv
```

Manual browser-assisted mode:

```bash
npm run autocomplete -- --seed "find my parked car" --headless false --out ./results/parking.csv
```

Validation pipeline with AI enabled:

```bash
npm run validate -- --idea "automatic app that saves parking location when Bluetooth disconnects" --ai true
```

Prepare the local SQLite database:

```bash
npm run db -- --migrate
```

Run the first persisted validation flow:

```bash
npm run validate -- --idea "automatic app that saves parking location when Bluetooth disconnects"
```

Run validation with external evidence collectors enabled:

```bash
npm run validate -- --idea "automatic app that saves parking location when Bluetooth disconnects" --external true
```

Scope external collection to selected surfaces:

```bash
npm run validate -- --idea "automatic app that saves parking location when Bluetooth disconnects" --external true --serp true --reddit true --youtube false --reviews true --competitors true
```

## Inputs

- `--seed <phrase>` can be passed multiple times.
- `--seeds <path>` can be passed multiple times and reads TXT, CSV, or `-` for stdin.
- TXT files use one seed phrase per line.
- CSV files must include a column named `seed`.
- Stdin input uses one seed phrase per line.
- Empty and duplicate seeds are ignored.
- `--country` defaults to `US`.
- `--language` defaults to `en`.
- `--depth` accepts `1` or `2` and defaults to `1`.
- `--out` is required and may be `.csv` or `.json`.
- `--modifier <value>` can be passed multiple times.
- `--modifiers <items>` accepts comma-separated values or a TXT file path.
- `--headless` defaults to `true`.
- `--delayMs` defaults to `1200`.
- `--maxPrefixes` defaults to `500`.
- `--maxDepth2Prefixes` defaults to `100`.
- `--resume` defaults to `true`.

Custom modifiers replace the default modifier list.

## SQLite Validation

- Default DB path: `./data/fetch-trends.sqlite`
- Environment override: `FETCH_TRENDS_DB_PATH`
- `npm run db -- --migrate` creates the schema and applies pending migrations.
- `npm run validate -- --idea "..."`
  stores ideas, jobs, tool runs, queries, autocomplete predictions, scores, reports, sources, evidence, and competitors.
- `validate` keeps the existing autocomplete CSV/JSON export behavior by writing artifacts under `./results/validate/`.
- External collectors default to `false` until explicitly enabled with `--external true`.
- Collector defaults live in `config/collectors.json`.
- `SERP_API_KEY` enables the first live provider-backed external collector path.
- Missing external provider keys produce warnings and blocked collector tool runs, but the validation job still completes.

## Default Modifiers

```text
automatic
automatically
app
Android
iPhone
Bluetooth
no tap
without opening app
best
alternative
not working
Google Maps
Apple Maps
```

## Query Expansion

Depth 1 generates:

```text
seed
seed + space + a-z
modifier + space + seed
seed + space + modifier
how to + seed
best + seed
seed app
seed android
seed iphone
seed automatically
seed not working
```

Depth 2 takes predictions collected from depth 1 and generates:

```text
prediction + space + a-z
```

Depth 2 is capped by `--maxDepth2Prefixes`.

## Outputs

For `--out ./results/parking.csv`, the tool writes:

- `./results/parking.csv`
- `./results/parking.json`
- `./results/parking.summary.csv`
- `./results/parking.summary.json`
- `./results/parking.resume.json`

When `npm run validate` runs with AI enabled, it can also write:

- `./artifacts/ai-runs/job-<job-id>/*.input.json`
- `./artifacts/ai-runs/job-<job-id>/*.prompt.txt`
- `./artifacts/ai-runs/job-<job-id>/*.output.txt`
- `./artifacts/ai-runs/job-<job-id>/*.metadata.json`

CSV columns:

```text
query
normalized_query
intent
confidence_score
platform
source_seeds
source_seed_count
source_prefixes
source_prefix_count
country
language
timestamp
next_validation_step
```

## Validation Flow

`npm run validate` now follows this bounded pipeline:

- deterministic idea record creation in SQLite
- AI idea normalization when available
- AI query generation when available
- autocomplete collection through the existing Playwright utility
- deterministic scoring
- AI evidence summary when available
- AI final report draft when available
- fallback to deterministic scoring/reporting whenever AI is unavailable or invalid

AI runs are evidence-first:

- no web browsing
- no source-file mutation
- no direct SQLite writes from Codex
- raw AI output stays in artifacts, while parsed JSON and metadata are stored in `tool_runs`

- High purchase intent: check Keyword Planner and Google page 1 competitors.
- How-to intent: check if a built-in or free solution already solves it.
- Problem intent: search Reddit and app reviews for complaints.
- Comparison intent: analyze competitors and pricing.
- Low intent: keep only if it reveals useful wording.

## Development

```bash
npm run build
npm test
npm run lint
```
