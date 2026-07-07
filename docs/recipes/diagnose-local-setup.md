# Diagnose Local Setup

## When To Use

Use this when local commands fail, the web UI appears empty, artifacts are missing, or a new machine needs a setup check.

## Prerequisites

- You are working from the repository root.
- Dependencies should already be installed, or you are prepared to install them.
- You know whether a custom database path is being used.

## Commands

```bash
npm install
npx playwright install chromium
npm run db -- --migrate
npm run build
npm test
npm run lint
npm run web -- --run-jobs false --ai false
```

If you use a custom database path, add `--db <path>` to `db`, `web`, `report`, and workflow commands that read persisted data.

## Expected Outputs

- Installed npm dependencies.
- Playwright Chromium available locally.
- A migrated SQLite database.
- Passing build, test, and lint checks.
- A local web URL printed by the web command.

## How To Read The Result

Passing checks mean the local toolchain and database can start. They do not prove that live collectors, provider keys, AI execution, or external websites are healthy.

## Failure Handling

- If install fails, check Node version `>=20.0.0`.
- If Playwright fails, rerun the Chromium install and check local browser permissions.
- If migration fails, confirm the database path is writable.
- If the web UI is empty, confirm the same database path was used by validation.
- If tests fail after unrelated local edits, inspect `git status` before reverting anything.

## Next Step

Run [Validate One Idea](./validate-one-idea.md) once the local setup passes.
