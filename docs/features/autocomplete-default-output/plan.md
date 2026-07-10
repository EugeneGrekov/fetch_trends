# Autocomplete Default Output Plan

## Goal
Allow `./src/cli.ts` to run without `--out` by generating a deterministic default output path from the run timestamp and the first input word.

## Prerequisite
Autocomplete CLI direct execution, stdin auto-detection, and existing report-writing behavior must already be working.

## Non-Goals
- Do not change report contents or report formats.
- Do not change resume-state semantics.
- Do not introduce remote storage or alternate output backends.

## Target Structure
- Update `src/utilities/autocomplete/cli.ts` to resolve a default output path when `--out` is omitted.
- Add a small helper for filename sanitization and timestamp formatting.
- Update autocomplete input/output tests.
- Add feature docs under `docs/features/autocomplete-default-output/`.

## Implementation Steps
1. Make `--out` optional in the autocomplete CLI.
2. Resolve a default output path after seeds are loaded.
3. Format the filename as timestamp first and first input word last.
4. Place default output under `./results/`.
5. Add tests for explicit and implicit output paths.
6. Document the change in an implementation note.

## Data / API / CLI Contracts
- Explicit `--out <path>` continues to work unchanged.
- If `--out` is omitted, the CLI writes to `./results/<timestamp>-<first-word>.csv`.
- `<timestamp>` should be filesystem-safe and sortable.
- `<first-word>` should come from the first non-empty input seed and be sanitized for filenames.

## Testing Plan
- Add unit coverage for default output path generation.
- Add coverage for the CLI using stdin or seed args with omitted `--out`.
- Keep tests local and deterministic.

## Verification
Commands to run, normally:
  npm test
  npm run build
  npm run lint

## Acceptance Criteria
- `./src/cli.ts --help` no longer requires `--out`.
- Running the CLI without `--out` writes outputs to a generated path under `./results/`.
- The generated filename starts with a timestamp and ends with the first input word.

## Risks
- Timestamp formatting may produce illegal filename characters if not sanitized.
- Different input forms may produce unexpected "first words" without a clear selection rule.

## Recommended Next Phase
If needed, add a documented `--outDir`/basename split so operators can control directory and naming separately.

## Superseded Format Note
The exact default filename format in this phase was later changed by
`docs/features/autocomplete-output-quality/` to `YYYY-MM-DD_HH:mm_<first-word>.csv`.
