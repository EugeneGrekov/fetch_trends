---
name: micro-business-autocomplete
description: Run local Google Autocomplete organic or controlled-modifier research for micro-business seed phrases, inspect CSV/JSON/Markdown artifacts, and summarize search-language evidence without claiming demand volume.
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
2. `docs/reference/architecture.md`
3. `docs/features/codex-skills/plan.md`

## Run

Default to organic discovery first. Organic mode queries the exact seed plus `seed a` through `seed z`, marks returned rows as `source_mode=organic`, and does not add modifiers.

Omit `--out` when the default `./results/YYYY-MM-DD_HH:mm_<first-word>.csv` basename is acceptable.

Single seed:

```bash
npm run autocomplete -- --mode organic --seed "<seed>" --country US --language en --depth 1 --out ./results/<slug>-organic.csv
```

Batch seeds:

```bash
npm run autocomplete -- --mode organic --seeds <path> --country US --language en --depth 1 --out ./results/<slug>-organic.csv
```

Include digit suffixes only when explicitly useful:

```bash
npm run autocomplete -- --mode organic --includeDigits --seeds <path> --country US --language en --depth 1 --out ./results/<slug>-organic.csv
```

Use depth 2 only when the extra coverage is worth the slower run:

```bash
npm run autocomplete -- --mode organic --seed "<seed>" --country US --language en --depth 2 --maxDepth2Prefixes 100 --out ./results/<slug>-organic.csv
```

Run controlled modifier discovery separately, only with an explicit user-provided allowlist:

```bash
npm run autocomplete -- --mode modifier --modifiers data/modifiers__gmail.txt --seeds <path> --country US --language en --depth 1 --out ./results/<slug>-modifier.csv
```

## Inspect

Review:

- stdout totals from the CLI
- `*.md` first for the human-readable report
- `*.summary.json`
- `*.json`
- `*.csv` only when you need exact returned prediction rows and metadata

## Summarize

Report:

- output files used
- total predictions
- unique normalized predictions
- strong organic suggestions
- repeated suggestions across seeds
- tool-seeking phrases
- informational and how-to phrases
- Gmail workflow phrases and Chrome extension phrases when relevant
- modifier-only suggestions separately from organic evidence
- no-signal seeds
- rejected noise
- recommended next validation phrases

## Guardrails

- Do not claim search volume or monthly demand.
- Do not say autocomplete proves willingness to pay.
- Do not treat generated prefixes as evidence; only exact Google-returned predictions are evidence.
- Do not mix organic and modifier evidence. Organic suggestions are the primary natural-language signal.
- Do not run modifier mode without `--modifier` or `--modifiers`.
- Do not rank awkward generated phrases as top suggestions.
- Stop safely if Google shows CAPTCHA or anti-bot pages.
- Do not bypass anti-bot systems.
- Distinguish facts from your interpretation.

## Failure handling

- If the CLI command is unavailable, say which command is missing and stop.
- If the run fails, report the first relevant error and whether output artifacts were still written.
- If no predictions are collected, mark the result inconclusive.
