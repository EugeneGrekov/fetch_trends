# Autocomplete Stdin Implementation

## Summary
`src/cli.ts` now accepts piped stdin as seed input without requiring `--seeds -`.
When stdin is not a TTY and no explicit seed arguments are provided, the CLI reads stdin automatically.

## Files Changed
- `src/cli.ts`
- `src/utilities/autocomplete/input.ts`
- `src/utilities/autocomplete/input.test.ts`

## Commands Changed
- Direct execution remains `./src/cli.ts --help`
- Piped input now works as `cat seeds.txt | ./src/cli.ts --out results.csv`

## Tests Updated
- Added coverage for plain-text stdin input.
- Added coverage for CSV stdin input with a `seed` header.

## Verification
- `npm test`
- `npm run build`
- `npm run lint`

## Known Limitations
- Auto-detection only runs when stdin is non-interactive.
- CSV stdin auto-detection expects a `seed` header.

## Follow-up Work
- Consider adding a dedicated help example for piped stdin if this becomes a common workflow.
