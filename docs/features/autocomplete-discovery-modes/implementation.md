# Autocomplete Discovery Modes Implementation

## Summary
Autocomplete now separates organic discovery from controlled modifier discovery.
Reports distinguish generated prefixes from exact Google-returned predictions, attach source metadata and rank to every returned prediction, filter rejected noise into its own section, and use evidence score plus intent classification instead of purchase-intent confidence ranking.

## Files Changed
- `src/utilities/autocomplete/analysis.ts`
- `src/utilities/autocomplete/analysis.test.ts`
- `src/utilities/autocomplete/cli.ts`
- `src/utilities/autocomplete/expansion.ts`
- `src/utilities/autocomplete/expansion.test.ts`
- `src/utilities/autocomplete/exporter.ts`
- `src/utilities/autocomplete/exporter.test.ts`
- `src/utilities/autocomplete/runner.ts`
- `src/utilities/autocomplete/runner.test.ts`
- `src/utilities/autocomplete/types.ts`
- `src/revalidation/revalidation-runner.ts`
- `src/validation/orchestrator.ts`
- `src/utilities/autocomplete/README.md`
- `docs/reference/commands.md`
- `docs/features/README.md`
- `docs/features/autocomplete-discovery-modes/README.md`
- `docs/features/autocomplete-discovery-modes/plan.md`

## Commands Changed
- `npm run autocomplete -- --mode organic` is the default and queries exact seeds plus `a-z`.
- `--includeDigits` adds `0-9` suffixes in organic mode.
- `npm run autocomplete -- --mode modifier --modifiers <path>` requires an explicit modifier allowlist.
- Modifier mode does not add default modifiers silently.

## Schema / Migration Changes
- None.
- Compatibility aliases remain in JSON for existing validation/revalidation code.

## Tests Added or Updated
- Updated expansion tests for organic and modifier modes.
- Updated analysis tests for semantic relevance, rejected noise, evidence score, and new intent labels.
- Updated exporter tests for the requested Markdown report sections.
- Updated runner tests for returned-prediction CSV metadata.

## Verification
- `npm test` passed on 2026-07-10.
- `npm run build` passed on 2026-07-10.
- `npm run lint` passed on 2026-07-10.

## Known Limitations
- Repeated-across-runs scoring is not fully historical without a persistence layer; current scoring can only use current/resumed artifacts.
- SQLite persistence still stores legacy prediction columns until a separate migration phase is planned.

## Follow-up Work
- Add database columns for source mode, modifier, rank, evidence score, relevance status, and intent classification.
- Add optional loading of previous result files for true repeated-across-runs evidence scoring.
