---
name: micro-business-report
description: Read stored validation reports by idea or job and turn local evidence into a concise discussion-ready summary.
---

# Micro-Business Report

Use this skill when the user wants a stored report summarized, reviewed, or turned into discussion notes without rerunning validation.

## Core rule

Prefer stored evidence over fresh opinion.
Do not expand into a new validation run unless the user asks for it.

## Required context

Inspect these first when needed:

1. `README.md`
2. `docs/architecture.md`
3. `docs/codex-skills-plan.md`

## Run

By idea:

```bash
npm run report -- --idea-id <id> --format json
```

By job:

```bash
npm run report -- --job-id <id> --format json
```

Use `--format markdown` when you need the stored narrative exactly as written.

## Inspect

Focus on:

- report metadata
- stored markdown
- structured score summary when present

## Summarize

Return:

- short verdict
- evidence-backed reason
- top 3 risks
- top 3 missing proofs
- best next action
- the idea ID, job ID, and report ID used

## Guardrails

- Cite the local IDs used.
- Do not change stored reports.
- Do not turn a report summary into a stronger claim than the evidence supports.
- Keep facts, inference, and missing proof separate.

## Failure handling

- If no report exists for the provided ID, say so and ask for the other ID if useful.
- If the report has only markdown and no structured JSON, summarize the markdown and say the structured payload is unavailable.
