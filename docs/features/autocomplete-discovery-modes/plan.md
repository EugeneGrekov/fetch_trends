# Autocomplete Discovery Modes Plan

## Goal
Separate natural Google Autocomplete discovery from controlled modifier probing so reports identify language users already type instead of ranking manufactured prefix combinations as evidence.

## Prerequisite
Autocomplete collection, stdin/default output support, Markdown sidecars, and output-quality fixes must already be implemented.

## Non-Goals
- Do not edit generated `results/` artifacts.
- Do not add AI-based semantic filtering.
- Do not change SQLite schema in this phase.
- Do not remove backward-compatible in-memory fields needed by validation/revalidation code.

## Target Structure
- Extend autocomplete types with `sourceMode`, `modifierUsed`, `predictionRank`, relevance status, evidence score, and new intent labels.
- Update `src/utilities/autocomplete/expansion.ts` to generate prefixes for organic and modifier modes separately.
- Update `src/utilities/autocomplete/cli.ts` with `--mode organic|modifier` and optional organic digit expansion.
- Update `src/utilities/autocomplete/runner.ts` to stamp prediction metadata at collection time.
- Replace analysis scoring/classification with evidence score, intent classification, relevance filtering, and section builders.
- Update `src/utilities/autocomplete/exporter.ts` CSV/summary/Markdown report sections.
- Add focused tests for mode-specific expansion, metadata, relevance filtering, scoring, and report sections.

## Implementation Steps
1. Add `RunMode`, `SourceMode`, relevance status, and new intent types.
2. Generate organic prefixes as exact seed plus seed `a-z`, optionally `0-9`.
3. Generate modifier prefixes only from a user-provided allowlist, applying one modifier at a time before and after each seed.
4. Prevent modifier mode from using defaults silently.
5. Preserve generated prefixes separately from returned predictions.
6. Record `original_seed`, `prefix_sent`, `exact_prediction`, `source_mode`, `modifier_used`, `prediction_rank`, `country`, `language`, and `timestamp` for every prediction.
7. Deduplicate by lowercase whitespace normalization while preserving original Google text.
8. Filter by concept-group overlap and put rejected predictions into a "Rejected noise" section.
9. Replace confidence-first ranking in reports with evidence score and intent classification.
10. Add report sections requested by the user.
11. Add seed-level metrics including no-signal status.
12. Verify with tests, build, and lint.

## Data / API / CLI Contracts
- `--mode organic` queries only exact seed and organic suffixes.
- `--mode modifier` requires `--modifier` or `--modifiers` and marks results as `source_mode="modifier"`.
- `--includeDigits` adds `0-9` suffixes to organic mode only.
- Generated prefixes are stored as generated prefixes and are not reported as suggestions.
- Prediction CSV uses exact returned predictions and includes source mode, modifier, rank, relevance, evidence score, and intent.
- Markdown includes:
  - Strong organic suggestions
  - Repeated suggestions across seeds
  - Tool-seeking phrases
  - Informational and how-to phrases
  - Gmail workflow phrases
  - Chrome extension phrases
  - Modifier-only suggestions
  - No-signal seeds
  - Rejected noise
  - Recommended next validation phrases

## Testing Plan
- Unit-test organic expansion has no modifiers by default.
- Unit-test modifier expansion requires and uses only supplied modifiers.
- Unit-test prediction records include rank/source mode/modifier metadata.
- Unit-test relevance filtering accepts useful examples and rejects awkward/noisy examples.
- Unit-test evidence score favors organic, repeated, multi-seed, multi-prefix, and better-rank suggestions.
- Unit-test Markdown sections and seed-level metrics.
- Default tests must not call live Google.

## Verification
Commands to run:
  npm test
  npm run build
  npm run lint

## Acceptance Criteria
- Organic and modifier discovery can be run separately.
- Organic mode does not add commercial/platform/device/feature modifiers.
- Modifier mode does not use default modifiers silently.
- Final suggestion lists contain only Google-returned exact predictions.
- Rejected predictions are visible in the Markdown report.
- Awkward generated combinations are rejected or excluded from top suggestion sections.

## Risks
- Existing validation code still expects older fields; keep compatibility aliases while reporting the new fields.
- Repeated-across-runs scoring is limited without persistence in this phase.

## Recommended Next Phase
Persist run fingerprints or load previous result files so repeated-across-runs scoring can become fully historical instead of limited to current/resumed artifacts.
