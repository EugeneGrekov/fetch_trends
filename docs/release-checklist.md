# Release Checklist

Use this checklist before handing a local Fetch Trends build to another operator or machine.

## Preflight

- Confirm Node.js is 20 or newer: `node --version`.
- Install dependencies: `npm install`.
- Install Playwright Chromium if needed: `npx playwright install chromium`.
- Review optional env settings in `config/example.env`.
- Keep real secrets in `.env` or shell environment, never in docs or package outputs.

## Required Verification

Run these from the repository root:

```bash
npm test
npm run build
npm run lint
npm run release:check
```

`npm run release:check` also runs tests, build, and lint. Run all commands explicitly during implementation work so failures are easy to attribute.

## Database Check

Verify migrations against the intended DB:

```bash
npm run db -- --migrate
```

For a disposable check:

```bash
FETCH_TRENDS_DB_PATH=./tmp/release-check.sqlite npm run db -- --migrate
```

Delete disposable DB files after inspection.

## Package Metadata

- Package bin entries must point at built files in `dist/`.
- Each bin path must have a source `.ts` counterpart.
- `package-lock.json` root bin metadata must match `package.json`.
- Required local docs must exist: `README.md`, `docs/install.md`, `docs/commands.md`, `docs/release-checklist.md`, `docs/architecture.md`.
- Required local skills must exist under `.codex/skills/`.

## Local Package Directory

After `npm run build`, create a local package directory when needed:

```bash
npm run package:local -- --out ./dist-package/fetch-trends
```

Inspect the package directory for:

- `dist/`
- `package.json`
- `package-lock.json`
- `README.md`
- `docs/`
- `prompts/`
- `.codex/skills/`
- `config/collectors.json`
- `config/example.env`

Do not commit `dist-package/` unless explicitly requested.

## Excluded Local Data

Package outputs must not include:

- SQLite DB files such as `*.sqlite`, `*.sqlite-*`, or `*.db`.
- `results/`.
- `artifacts/`.
- `backups/`.
- `exports/`.
- `runs/`.
- `.env` or `.env.*`.
- `*.resume.json`.
- logs.
- `node_modules/`.

## Diagnostics

If the current checkout exposes `npm run diagnose`, run:

```bash
npm run diagnose -- --json
```

`npm run release:check` runs the same diagnostic command with a temp SQLite DB when the script exists. Until that command is wired, release check reports diagnostics as a warning and uses package/bin/migration verification as the safe local equivalent.
When diagnostics are wired, release check parses the JSON status and fails on diagnostic `fail`.

## Final Review

- Confirm `git status --short` contains only intended release-packaging changes.
- Confirm generated outputs remain ignored.
- Record verification results in `docs/release-packaging-implementation.md`.
- Commit with a clear release-packaging message.
