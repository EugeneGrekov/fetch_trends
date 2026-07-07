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

## Verification

Verified in this implementation pass:

- `npm test`
- `npm run build`
- `node dist/src/report.js --help`

The current repo also has unrelated in-progress `README.md` work, so this implementation note is the source-of-truth documentation added in this commit.
