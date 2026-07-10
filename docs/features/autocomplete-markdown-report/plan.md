# Autocomplete Markdown Report Plan

## Goal
Add one Markdown sidecar file for every autocomplete run so operators get a compact, human-readable report alongside the existing machine-readable outputs.

## Prerequisite
Autocomplete CLI execution, default output path resolution, CSV/JSON export, and resume-state writing must already be implemented and verified.

## Non-Goals
- Do not remove or rename existing CSV, JSON, summary, or resume outputs.
- Do not add a new CLI flag for Markdown generation in this phase.
- Do not change SQLite schema, persistence shape, or downstream report consumers.

## Target Structure
- Extend `src/utilities/autocomplete/exporter.ts` with a Markdown sidecar path and renderer.
- Optionally extend autocomplete run metadata when needed to render run input accurately.
- Update autocomplete runner/exporter tests to validate the Markdown output.
- Update command and architecture documentation for the new output file.

## Implementation Steps
1. Add `md` to autocomplete output-path resolution so every basename gets a matching Markdown sidecar.
2. Render a compact Markdown report from the final run report without changing existing JSON summary contracts.
3. Write the Markdown file through the same atomic file-write path already used for other outputs.
4. Include input settings, final summary, per-seed summary, top unique predictions, and conditional errors.
5. Extend automated tests to validate both Markdown path generation and rendered content.
6. Record the implementation result in an implementation note.

## Data / API / CLI Contracts
- `OutputPaths` includes `md: string`.
- Every autocomplete run writes `<base>.md` next to `<base>.csv`, `<base>.json`, `<base>.summary.csv`, `<base>.summary.json`, and `<base>.resume.json`.
- The Markdown report includes run input and run output in a compact summary-oriented format.
- Existing JSON report shapes remain unchanged except for an optional defensive metadata field if needed to render inputs.

## Testing Plan
- Update runner coverage to assert `<base>.md` is written.
- Assert the Markdown includes the title, seed input, run settings, output summary, top predictions section, and sample predictions.
- Add exporter-level coverage for Markdown path generation and report rendering.
- Keep all tests local and deterministic.

## Verification
Commands to run, normally:
  npm test
  npm run build
  npm run lint

## Acceptance Criteria
- Running autocomplete writes a Markdown sidecar with the same basename as the existing outputs.
- The Markdown includes both input settings and output summaries without dumping raw internal state.
- Existing CSV, JSON, summary, and resume behaviors continue to work unchanged.

## Risks
- Markdown tables can become unreadable if values are not escaped correctly.
- Adding input metadata for rendering could accidentally change resume compatibility if not handled defensively.
- Very large prediction sets could create noisy reports unless the top-predictions section is capped.

## Recommended Next Phase
If operators need customization later, add an explicit report-format or output-template option without changing the default sidecar behavior.
