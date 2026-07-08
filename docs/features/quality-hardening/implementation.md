# Quality Hardening Implementation

## Summary

Implemented reliability-focused hardening without intentionally changing product behavior.

The work added shared offline test helpers, moved validation fakes out of a single test file, added migration compatibility coverage that is stable when later migrations are appended, and added an offline command-documentation consistency checker.

## Files / Modules Added Or Changed

- `src/testing/fixtures.ts` adds deterministic fixture builders for ideas, jobs, tool runs, queries, autocomplete predictions, sources, evidence, competitors, scores, reports, experiments, decisions, and revalidation rows.
- `src/testing/temp-db.ts` adds a temp SQLite database helper that can optionally apply all migrations and clean up after tests.
- `src/testing/fake-collectors.ts` adds fake autocomplete, SERP, Reddit, YouTube, review, and competitor collectors for offline integration tests.
- `src/testing/fake-ai.ts` adds fake AI executors for static JSON and invalid JSON responses.
- `src/db/migration-compatibility.test.ts` verifies migration idempotence, required tables, and representative repository compatibility after all migrations.
- `src/validation/orchestrator.test.ts` now uses shared fake collectors and fake AI instead of local test-only classes.
- `scripts/check-command-docs.ts` adds an offline check for README, optional `docs/reference/commands.md`, and recipe `npm run` references against `package.json`.
- `scripts/check-command-docs.test.ts` covers command-reference parsing and the current repository command references.
- `vitest.config.ts` enables Vitest globals to match the existing TypeScript `vitest/globals` configuration.
- `eslint.config.js` adds Vitest globals for `*.test.ts` files.

## Commands Added Or Changed

No package command was added.

The new command-documentation checker can be run directly:

```bash
npx tsx scripts/check-command-docs.ts
```

## Schema / Migration Changes

No schema or migration changes were made.

Migration hardening was added through tests only.

## Tests Added Or Updated

- Added migration compatibility tests for:
  - applying all migrations once
  - rerunning migrations as a no-op
  - required table presence
  - representative repository writes after migration
- Added command-documentation consistency tests.
- Updated validation orchestrator tests to use shared fake services.

Default tests remain offline. The shared fakes avoid live Google, SERP providers, Reddit, YouTube, live Codex, payment providers, Search Console, analytics, or network services.

## Verification Results

Verification was run against the current worktree, which also included concurrent release, diagnostics, roadmap, and documentation changes from other agents.

```bash
npm test
npm run build
npm run lint
npx tsx scripts/check-command-docs.ts
npm run release:check
```

All commands passed.

`npm run release:check` reported diagnostics warnings but no failures.

## Known Limitations

- The command-documentation checker validates `docs/reference/commands.md` only when that file exists, so it can coexist with checkouts before the release command reference is committed.
- Recipe validation is limited to Markdown files under `docs/recipes/`; no recipe files were present when this implementation was written.
- Portfolio fixtures were not added because portfolio rows/tables are not implemented in the current schema.
- Existing live-capable commands still require explicit fake collectors or disabled flags in tests; this phase added shared utilities but did not rewrite every older test setup.

## Follow-Up Work

- Wire `scripts/check-command-docs.ts` into `package.json` after command/recipe documentation ownership settles.
- Use the shared fixtures in older repository and command tests where it reduces duplication without obscuring intent.
- Add recipe consistency coverage when workflow recipe files are committed.
