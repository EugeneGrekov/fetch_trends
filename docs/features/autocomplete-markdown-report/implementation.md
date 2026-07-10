# Autocomplete Markdown Report Implementation

## Summary
Autocomplete runs now write a Markdown sidecar next to the existing CSV, JSON, summary, and resume files.
The report is compact and human-readable, covering run inputs, final counts, per-seed status, top unique predictions, and errors when present.

## Files Changed
- `src/utilities/autocomplete/exporter.ts`
- `src/utilities/autocomplete/runner.ts`
- `src/utilities/autocomplete/types.ts`
- `src/utilities/autocomplete/cli.ts`
- `src/utilities/autocomplete/README.md`
- `src/utilities/autocomplete/exporter.test.ts`
- `src/utilities/autocomplete/runner.test.ts`
- `docs/reference/commands.md`
- `docs/reference/architecture.md`
- `docs/features/README.md`
- `docs/features/autocomplete-markdown-report/README.md`
- `docs/features/autocomplete-markdown-report/plan.md`

## Commands Changed
- `npm run autocomplete` now produces a Markdown sidecar automatically as part of the default output set.
- `--out` help text now describes the CSV/JSON/Markdown output family.

## Schema / Migration Changes
- None.

## Tests Added or Updated
- Added `src/utilities/autocomplete/exporter.test.ts` for Markdown path generation and renderer coverage.
- Updated `src/utilities/autocomplete/runner.test.ts` to assert the `.md` sidecar is written and contains expected content.

## Verification
- `npm test` passed on 2026-07-10.
- `npm run build` passed on 2026-07-10.
- `npm run lint` passed on 2026-07-10.

## Known Limitations
- The Markdown report intentionally caps the top unique predictions table at 25 rows.
- The report summarizes the run rather than dumping every generated prefix or raw collected prediction.

## Follow-up Work
- Add optional formatting controls only if operators need alternate report shapes or larger prediction sections.
- Consider surfacing the Markdown report path in CLI completion output for easier scripting.
