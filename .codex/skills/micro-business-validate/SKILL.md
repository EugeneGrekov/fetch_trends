---
name: micro-business-validate
description: Run the local micro-business validation pipeline, automate SERP-backed external search with SerpAPI credit preflight, read stored evidence, and summarize the verdict without overstating proof.
---

# Micro-Business Validate

Use this skill when the user asks whether an idea looks promising, should be validated deeper, or should be reframed based on the local pipeline.

## Core rule

This project validates one-time-payment micro-business ideas.
Prefer stored local evidence over opinion.
Only real payment validates willingness to pay.

## Required context

Inspect these first when needed:

1. `README.md`
2. `docs/reference/architecture.md`
3. `docs/features/codex-skills/plan.md`
4. `docs/reference/commands.md`
5. `config/collectors.json`

## Run

Default validation:

```bash
npm run validate -- --idea "<idea>" --country US
```

Optional depth-2 pass:

```bash
npm run validate -- --idea "<idea>" --country US --depth 2 --maxDepth2Prefixes 100
```

## External Search

Use external search when the user asks for SERP, Reddit/forum, YouTube, review, or competitor evidence.

Before any `--external true` run, estimate SerpAPI credits and check the account.

Full external preflight:

```bash
node .codex/skills/micro-business-validate/scripts/serpapi-account.mjs --needed 32
```

Low-credit SERP-only preflight:

```bash
node .codex/skills/micro-business-validate/scripts/serpapi-account.mjs --needed 8
```

Full external search can spend up to 32 SerpAPI credits because up to 8 queries feed 4 SERP-backed collectors: SERP, Reddit, YouTube, and reviews. Competitor fetching uses SERP candidates but does not directly spend SerpAPI credits.

Full search:

```bash
npm run validate -- --idea "<idea>" --country US --external true --serp true --reddit true --youtube true --reviews true --competitors true --ai false
```

Low-credit search:

```bash
npm run validate -- --idea "<idea>" --country US --external true --serp true --reddit false --youtube false --reviews false --competitors false --ai false
```

If credits are insufficient, do not run the full search. Ask whether to run a lower-credit scope, disable external collectors, or wait for renewal.

## Inspect

Use the `validate` stdout for:

- job ID
- database path
- autocomplete artifact path
- score and decision
- external source/evidence/competitor counts
- stored report ID
- AI used
- warnings from AI or external collectors

Then inspect the stored report:

```bash
npm run report -- --job-id <job-id> --format json
```

Inspect local diagnostics when collector warnings or blocked runs appear:

```bash
npm run diagnose -- --json --db <db-path>
```

## Summarize

Report:

- idea ID from stored report metadata
- job ID
- report ID
- current verdict
- 100-point search-language score
- autocomplete artifact path
- external collector scope used
- SerpAPI credits before the run when checked
- strongest evidence
- weakest evidence
- collector warnings or blocked/error states
- missing proof
- one next validation action

Use phrases like `automated validation passed`, `promising but incomplete`, or `validate deeper`.
Do not say the business is validated unless there is real payment evidence.

## Guardrails

- The current pipeline is search-language-first. Say that clearly.
- If evidence is only autocomplete-based, call it search-language evidence.
- Treat organic autocomplete suggestions as stronger wording evidence than modifier-only suggestions.
- Do not treat generated prefixes or modifier allowlist items as evidence unless Google returned them as exact predictions.
- `npm run validate` still uses the older autocomplete default path; run `npm run autocomplete -- --mode organic` separately when clean organic-only autocomplete evidence is required.
- Do not spend SerpAPI credits without a preflight check when `SERP_API_KEY` is available.
- Do not print or persist `SERP_API_KEY`.
- Do not hide SerpAPI `401`, `429`, timeout, blocked, or warning states.
- Do not invent external proof that was not collected locally.
- Do not mutate database rows or rewrite stored reports.

## Failure handling

- If `validate` fails, report the failing command and first relevant error.
- If the SerpAPI account check fails with missing key, say external collectors are unavailable and offer autocomplete-only validation.
- If the SerpAPI account check returns insufficient credits, report needed and available credits and stop before running full external search.
- If SerpAPI returns `429`, treat it as hourly-limit or exhausted-searches risk and stop or reduce scope.
- If report lookup fails after validation, cite the job ID and state that the stored report could not be loaded.
- If the evidence set is empty, mark the result inconclusive.
