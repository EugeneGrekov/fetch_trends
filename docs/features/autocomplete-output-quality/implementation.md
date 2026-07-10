# Autocomplete Output Quality Implementation

## Summary
Autocomplete defaults and Markdown output were tightened after a real report exposed three problems:
invalid Markdown table rows, parking/mobile-map modifiers and hidden mobile/app suffixes polluting unrelated runs, seed-relevant predictions being buried by generic high-confidence noise, and hard-to-read default filenames.

## Files Changed
- `src/utilities/autocomplete/constants.ts`
- `src/utilities/autocomplete/constants.test.ts`
- `src/utilities/autocomplete/exporter.ts`
- `src/utilities/autocomplete/exporter.test.ts`
- `src/utilities/autocomplete/expansion.ts`
- `src/utilities/autocomplete/expansion.test.ts`
- `src/utilities/autocomplete/output.ts`
- `src/utilities/autocomplete/output.test.ts`
- `src/utilities/autocomplete/README.md`
- `docs/reference/commands.md`
- `docs/features/README.md`
- `docs/features/autocomplete-output-quality/README.md`
- `docs/features/autocomplete-output-quality/plan.md`

## Commands Changed
- `npm run autocomplete` default output names now use `YYYY-MM-DD_HH:mm_<first-word>` when `--out` is omitted.
- Default autocomplete modifiers now use neutral business-validation terms instead of mobile/maps terms.
- Depth-1 expansion now uses base seed, alphabet suffixes, and configured modifiers only.
- Markdown top predictions now rank by seed-term overlap before confidence.

## Schema / Migration Changes
- None.

## Tests Added or Updated
- Added default-modifier coverage to prevent the old mobile/maps modifiers from returning.
- Updated expansion coverage to prevent hidden `app`, `android`, `iphone`, `automatically`, and `not working` suffixes from returning.
- Added Markdown table row assertions for per-seed, top prediction, and error rows.
- Added Markdown relevance-order coverage so a closer seed-term match outranks generic high-confidence noise.
- Updated default output-path tests for local-date and minute filenames.

## Verification
- `npm test` passed on 2026-07-10.
- `npm run build` passed on 2026-07-10.
- `npm run lint` passed on 2026-07-10.

## Known Limitations
- Neutral default modifiers improve baseline quality but still cannot be ideal for every domain.
- Runs that need mobile/app/problem expansion must pass those terms explicitly with `--modifier` or `--modifiers`.
- Existing generated reports in `results/` are not rewritten by this change.

## Follow-up Work
- Add modifier presets if recurring domains need repeatable expansion profiles.
- Add relevance-aware ranking later if neutral defaults still bury useful predictions in broad runs.
