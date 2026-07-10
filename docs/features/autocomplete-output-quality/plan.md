# Autocomplete Output Quality Plan

## Goal
Fix real-run autocomplete output issues: invalid Markdown tables, noisy default modifiers and hidden mobile/app suffixes inherited from the parking/mobile-map example, and hard-to-read default filenames.

## Prerequisite
Autocomplete default output paths, stdin support, and Markdown report sidecars must already be implemented.

## Non-Goals
- Do not edit generated `results/` artifacts.
- Do not add AI-based filtering or external relevance services in this phase.
- Do not change CSV/JSON schema beyond existing run metadata.
- Do not make default modifiers idea-specific through inference.

## Target Structure
- Update `src/utilities/autocomplete/exporter.ts` Markdown table row rendering.
- Update `src/utilities/autocomplete/constants.ts` default modifiers to a neutral business-validation set.
- Update `src/utilities/autocomplete/expansion.ts` so depth-1 expansion uses only base seeds, alphabet suffixes, and configured modifiers.
- Update `src/utilities/autocomplete/output.ts` default filename timestamp formatting to compact local date and minute.
- Extend focused tests in `src/utilities/autocomplete/*.test.ts`.
- Update autocomplete docs to describe local-time filenames and neutral default modifiers.

## Implementation Steps
1. Replace Markdown table row assembly with a helper that emits valid pipe-delimited cells.
2. Add regression expectations that generated Markdown rows contain valid separators.
3. Rank Markdown top predictions with a deterministic seed-term overlap score before confidence so closer matches are not buried by generic autocomplete noise.
4. Replace mobile/maps defaults with generic validation modifiers such as tool/software/extension/API/pricing/alternative terms.
5. Remove hidden mobile/app/problem suffixes from depth-1 expansion so custom modifiers are the only non-alphabet expansion terms.
6. Format generated default output paths as `YYYY-MM-DD_HH:mm_<first-word>` instead of ISO-like strings with `T`, seconds, and timezone suffixes.
7. Update command/reference docs and implementation notes.
8. Run focused tests, full tests, build, and lint.

## Data / API / CLI Contracts
- Explicit `--out` paths remain unchanged.
- Omitted `--out` writes to `./results/<local-date>_<time>_<first-word>.csv`.
- Local timestamp format uses minute precision, for example `2026-07-09_18:12_company.csv`.
- Default modifiers remain overridable with `--modifier` and `--modifiers`.
- Passing any `--modifier` or `--modifiers` uses only those modifiers; hidden mobile/app suffixes are not added.
- Markdown reports must render valid tables for per-seed summaries, top predictions, and errors.
- Markdown top predictions are sorted by seed-term overlap before confidence; full CSV/JSON outputs remain available for complete data.

## Testing Plan
- Unit-test local timestamp filename formatting deterministically enough to avoid hard-coded machine timezone assumptions.
- Unit-test Markdown table rows include column separators and closer seed-term matches rank above generic high-confidence noise.
- Unit-test default modifiers exclude mobile/maps terms and include neutral business-validation terms.
- Unit-test depth-1 expansion does not emit mobile/app/problem suffixes unless supplied as explicit modifiers.
- Keep tests local and deterministic.

## Verification
Commands to run, normally:
  npm test
  npm run build
  npm run lint

## Acceptance Criteria
- New Markdown reports render readable tables.
- Default autocomplete runs no longer include parking/mobile-map modifiers unless supplied by the user.
- Custom modifier runs do not include hidden `app`, `android`, `iphone`, `automatically`, or `not working` suffixes unless supplied by the user.
- Default filenames use local date and minute in the requested readable format.
- Existing explicit output path behavior still works.

## Risks
- Neutral default modifiers still cannot be optimal for every business idea.
- Local time filenames vary by machine timezone, so tests must derive the expected local timestamp from a fixed `Date`.

## Recommended Next Phase
Add optional modifier presets or a prompt-assisted seed/modifier generator if repeated domains need stronger relevance than neutral defaults can provide.
