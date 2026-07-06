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
