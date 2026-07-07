---
name: micro-business-autocomplete
description: Run local Google Autocomplete research for micro-business seed phrases and summarize search-language evidence without claiming demand volume.
---

# Micro-Business Autocomplete

Use this skill when the user wants search-language evidence, seed expansion, or autocomplete-based wording validation for a micro-business idea.

## Core rule

Skills call tools.
Tools store evidence.
Codex summarizes results.

Autocomplete validates wording, not demand volume or willingness to pay.

## Required context

Inspect these first when the task is ambiguous:

1. `README.md`
2. `docs/architecture.md`
3. `docs/codex-skills-plan.md`

## Run

Single seed:

```bash
npm run autocomplete -- --seed "<seed>" --country US --language en --depth 1 --out ./results/<slug>.csv
```

Batch seeds:

```bash
npm run autocomplete -- --seeds <path> --country US --language en --depth 1 --out ./results/<slug>.csv
```

Use depth 2 only when the extra coverage is worth the slower run:

```bash
npm run autocomplete -- --seed "<seed>" --country US --language en --depth 2 --maxDepth2Prefixes 100 --out ./results/<slug>.csv
```

## Inspect

Review:

- stdout totals from the CLI
- `*.summary.json`
- `*.json`
- `*.csv` only when you need exact rows

## Summarize

Report:

- output files used
- total predictions
- unique normalized predictions
- top high-intent queries
- top problem-intent queries
- weak or low-intent queries to avoid
- one recommended next validation action

## Guardrails

- Do not claim search volume or monthly demand.
- Do not say autocomplete proves willingness to pay.
- Stop safely if Google shows CAPTCHA or anti-bot pages.
- Do not bypass anti-bot systems.
- Distinguish facts from your interpretation.

## Failure handling

- If the CLI command is unavailable, say which command is missing and stop.
- If the run fails, report the first relevant error and whether output artifacts were still written.
- If no predictions are collected, mark the result inconclusive.
