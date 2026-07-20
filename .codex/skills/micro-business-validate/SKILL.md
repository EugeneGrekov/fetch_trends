---
name: micro-business-validate
description: Run the local micro-business validation pipeline, read stored evidence, and summarize the current verdict without overstating proof.
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

## Run

```bash
npm run validate -- --idea "<idea>" --country US
```

Optional depth-2 pass:

```bash
npm run validate -- --idea "<idea>" --country US --depth 2 --maxDepth2Prefixes 100
```

## Inspect

Use the `validate` stdout for:

- job ID
- database path
- autocomplete artifact path
- score and decision
- stored report ID

Then inspect the stored report:

```bash
npm run report -- --job-id <job-id> --format json
```

## Summarize

Report:

- idea ID from stored report metadata
- job ID
- report ID
- current verdict
- 100-point search-language score
- strongest evidence
- weakest evidence
- missing proof
- one next validation action

Use phrases like `automated validation passed`, `promising but incomplete`, or `validate deeper`.
Do not say the business is validated unless there is real payment evidence.

## Guardrails

- The current pipeline is search-language-first. Say that clearly.
- If evidence is only autocomplete-based, call it search-language evidence.
- Treat organic autocomplete suggestions as stronger wording evidence than modifier-only suggestions.
- Do not treat generated prefixes or modifier allowlist items as evidence unless Google returned them as exact predictions.
- Do not invent external proof that was not collected locally.
- Do not mutate database rows or rewrite stored reports.

## Failure handling

- If `validate` fails, report the failing command and first relevant error.
- If report lookup fails after validation, cite the job ID and state that the stored report could not be loaded.
- If the evidence set is empty, mark the result inconclusive.
