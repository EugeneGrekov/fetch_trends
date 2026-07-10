# Autocomplete Default Output Implementation

## Summary
The autocomplete CLI no longer requires `--out`.
When omitted, it writes to `./results/<timestamp>-<first-word>.csv`, using the first non-empty seed word as the suffix.

## Files Changed
- `src/utilities/autocomplete/cli.ts`
- `src/utilities/autocomplete/output.ts`
- `src/utilities/autocomplete/types.ts`
- `src/utilities/autocomplete/output.test.ts`
- `docs/reference/commands.md`

## Commands Changed
- `--out` is now optional for `./src/cli.ts`
- The default output path is generated from the run timestamp and first seed word

## Schema / Migration Changes
- None.

## Tests Added or Updated
- Added default output path coverage for explicit and implicit paths.
- Added fallback coverage for unsafe first-word tokens.

## Verification
- `npm test` passed
- `npm run build` passed
- `npm run lint` passed

## Known Limitations
- The default path is derived after seeds are loaded, so the first input must still be present.
- The filename suffix falls back to `seeds` if the first seed yields no safe filename token.

## Follow-up Work
- If operators want more control, split the default into `--outDir` plus a basename strategy.

## Superseded Format Note
The exact default filename format was later changed by
`docs/features/autocomplete-output-quality/` to `YYYY-MM-DD_HH:mm_<first-word>.csv`.
