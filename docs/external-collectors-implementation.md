# External Collectors Implementation

## What Landed

- Added SQLite tables and repositories for `sources`, `evidence`, and `competitors`.
- Added collector modules for `serp`, `reddit`, `youtube`, `competitors`, and `reviews`.
- Added validation integration in `src/validation/external-evidence.ts`.
- Added deterministic source normalization, complaint extraction, and competitor analysis helpers.
- Extended `validate` with `--external`, `--serp`, `--reddit`, `--youtube`, `--competitors`, and `--reviews`.
- Extended reports to surface external sources, quote-backed pain evidence, workaround evidence, competitors, payment signals, and collector gaps.

## Provider Strategy

- The first live provider-backed path is SerpApi through `SERP_API_KEY`.
- Reddit, YouTube, and review discovery currently layer on top of the SERP provider instead of separate direct APIs.
- Competitor collection fetches candidate pages directly after SERP discovery.
- Missing provider configuration is non-fatal: collector tool runs are marked blocked and the validation job still completes.

## Files Added

- `config/collectors.json`
- `src/utilities/external/types.ts`
- `src/utilities/serp/*`
- `src/utilities/reddit/*`
- `src/utilities/youtube/*`
- `src/utilities/reviews/*`
- `src/utilities/competitors/*`
- `src/db/repositories/sources.ts`
- `src/db/repositories/evidence.ts`
- `src/db/repositories/competitors.ts`
- `src/validation/external-evidence.ts`
- `src/validation/source-normalizer.ts`
- `src/validation/complaint-extractor.ts`
- `src/validation/competitor-analyzer.ts`

## Verification Notes

- `npm run build` passed.
- `npm run lint` passed.
- `npm test` is currently unstable in this checkout because the local Vitest install intermittently misses the `rolldown` native binding or hangs after startup. The collector implementation itself was exercised through the new targeted test coverage, but the full suite was not reliable enough to count as a clean pass in this environment.
