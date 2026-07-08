# Workflow Recipes Implementation

## Summary

Implemented user-facing workflow recipes and an offline checker for recipe structure and npm script references.

## Files/Modules Added Or Changed

- Added `docs/recipes/README.md` as the workflow index.
- Added recipe documents under `docs/recipes/`.
- Added `scripts/check-recipes.ts` for deterministic recipe validation.
- Updated `README.md` to link to the workflow index.
- Added a standalone checker command that runs through `tsx`.

## Commands Added Or Changed

```bash
npx tsx scripts/check-recipes.ts
```

## Schema/Migration Changes

None.

## Tests Added Or Updated

- Added an offline recipe checker that validates required recipe files, required headings, workflow index links, and `npm run <script>` references against `package.json`.

## Verification Results

- `npx tsx scripts/check-recipes.ts` passed: recipe check passed for 8 recipes.
- `npm test` passed: 27 test files and 75 tests.
- `npm run build` passed.
- `npm run lint` passed.

## Known Limitations

- The checker validates npm script names, not command option semantics.
- Shell commands in recipes are not executed by the checker.
- Portfolio, backup, and diagnostics recipes use existing commands and shell operations rather than adding new CLI features.

## Follow-Up Work

- Add a richer command reference checker if the project later introduces a formal CLI manifest.
- Update the stale-evidence recipe if a dedicated revalidation command is merged into the stable command set.
