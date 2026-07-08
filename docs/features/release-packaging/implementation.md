# Release Packaging Implementation

## Summary

Implemented local release packaging support for installing, documenting, verifying, and packaging the Fetch Trends CLI/web toolkit without publishing to hosted infrastructure.

The release check now validates tests, build, lint, temp SQLite migrations, diagnostics when available, package bin paths, required docs, local Codex skills, example env safety, and package inclusion rules.

## Files/Modules Added Or Changed

- Added `scripts/release-support.ts` with shared release verification and package-copy helpers.
- Added `scripts/release-check.ts` for `npm run release:check`.
- Added `scripts/package-local.ts` for `npm run package:local`.
- Added `scripts/release-support.test.ts` for offline release/package tests.
- Added `docs/reference/install.md`.
- Added `docs/reference/commands.md`.
- Added `docs/reference/release-checklist.md`.
- Added `config/example.env`.
- Updated `package.json` with release/package scripts and additional bin entries for packaged command access.
- Updated `package-lock.json` root bin metadata.
- Updated `tsconfig.json` so release scripts are type-checked by `npm run build`.
- Updated `.gitignore` for local package, backup, export, and DB outputs.
- Updated `README.md` with release documentation links.
- Updated `docs/reference/architecture.md` with the release packaging boundary.

## Commands Added Or Changed

```bash
npm run release:check
npm run package:local -- --out ./dist-package/fetch-trends
```

Added package bin coverage for report, web, and worker entrypoints alongside existing CLI bins.

## Schema/Migration Changes

None for release packaging.

Release verification applies existing migrations to a temp SQLite database and verifies that at least one migration is present.

## Tests Added Or Updated

- Release command assembly is tested without running child processes.
- `config/example.env` is tested to ensure all keys are value-free.
- `docs/reference/commands.md` is tested against all current `package.json` scripts.
- Package bin paths are tested for source counterparts.
- Local package exclusion rules are tested with temp directories and generated-data fakes.

## Verification Results

```bash
npm test
```

Passed: 29 test files, 82 tests.

```bash
npm run build
```

Passed.

```bash
npm run lint
```

Passed.

```bash
npm run release:check
```

Passed.

Release check summary:

- Tests: pass.
- Build: pass.
- Lint: pass.
- Migrations: pass, 5 migrations applied/found in a temp SQLite database.
- Diagnostics: warn, diagnostic JSON reported 36 pass, 6 warn, 0 fail, 12 skip.
- Package verification: pass.

```bash
npm run package:local -- --out ./dist-package/fetch-trends
```

Passed. The generated local package included `dist`, package metadata, README, docs, `.codex/skills`, prompts, `config/collectors.json`, and `config/example.env`.

Spot checks found no copied SQLite/DB files, `.env` files, logs, resume files, `results`, `artifacts`, `backups`, `exports`, or `node_modules` directories.

## Known Limitations

- `npm run release:check` treats diagnostic `warn` as non-blocking and fails only when diagnostic JSON reports `fail` or the diagnostic command exits nonzero.
- The local package builder creates a directory only; it does not create archives, publish to npm, publish Codex skills globally, build Docker images, package native desktop apps, or configure auto-updates.
- Package docs track scripts present in `package.json`; planned commands such as export, backup, restore, and portfolio still need their own implementation phases.
- Node currently prints an experimental warning for `node:sqlite` during tests and release checks.

## Follow-Up Work

- Re-run `npm run release:check` after future command additions so `docs/reference/commands.md` stays aligned with `package.json`.
- Add export/backup/restore release checks when those phases are implemented.
- Add archive generation only if local directory packaging becomes insufficient.
