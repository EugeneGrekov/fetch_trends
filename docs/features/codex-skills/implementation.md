# Codex Skills Implementation

## What shipped

This phase adds the first project-local Codex skills plus a stored-report CLI surface:

- `.codex/skills/micro-business-autocomplete/SKILL.md`
- `.codex/skills/micro-business-validate/SKILL.md`
- `.codex/skills/micro-business-report/SKILL.md`
- `npm run report -- --idea-id <id>`
- `npm run report -- --job-id <id>`

## Command behavior

`npm run report` reads the latest stored report from SQLite by idea ID or job ID.

Supported formats:

- `--format markdown`
- `--format json`

Optional export:

```bash
npm run report -- --job-id 12 --format markdown --out ./results/job-12-report.md
```

The JSON format includes:

- report metadata
- stored markdown
- parsed structured payload when the report row includes JSON

## Skill boundaries

The shipped skills are thin wrappers over local commands and stored artifacts.

They should:

- run the local CLI
- read stored reports or report JSON
- summarize evidence, inference, and missing proof

They should not:

- invent evidence
- bypass SQLite
- mutate stored reports
- treat autocomplete as demand volume
- treat automated validation as proof of willingness to pay

## 2026-07-20 Autocomplete Skill Alignment

The autocomplete skill was updated after the discovery-modes feature so future agents:

- run `--mode organic` first without modifiers
- run `--mode modifier` only as a separate pass with an explicit allowlist
- treat only exact Google-returned predictions as evidence
- keep organic suggestions, modifier-only suggestions, and rejected noise separate

## Verification

Verified in this implementation pass:

- `npm test`
- `npm run build`
- `node dist/src/report.js --help`

Autocomplete skill alignment was additionally validated with `quick_validate.py` for the autocomplete, validate, and report skills on 2026-07-20.

The current repo also has unrelated in-progress `README.md` work, so this implementation note is the source-of-truth documentation added in this commit.
