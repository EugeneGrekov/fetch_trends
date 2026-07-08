# Roadmap Governance Implementation

## Summary

Implemented local roadmap governance for future phases. The phase adds lifecycle guidance, practical templates, hardened implementation-order rules, and an offline roadmap checker.

The governance support also warns when a phase already has an implementation note but `docs/governance/implementation-order.md` still reports a pre-implementation status.

## Files Changed

- `docs/governance/roadmap-governance.md`
- `docs/governance/templates/phase.md`
- `docs/governance/templates/implementation-note.md`
- `docs/governance/implementation-order.md`
- `docs/features/roadmap-governance/implementation.md`
- `docs/reference/architecture.md`
- `docs/reference/commands.md`
- `package.json`
- `scripts/check-roadmap.ts`
- `scripts/roadmap-support.ts`
- `scripts/roadmap-support.test.ts`

## Commands Added or Changed

- Added `npm run roadmap:check`.
- Added direct checker entrypoint `npx tsx scripts/check-roadmap.ts`.

## Schema/Migration Changes

None.

## Tests Added or Updated

- Added `scripts/roadmap-support.test.ts` for required headings, implementation-order parsing, next-missing handling, implemented-phase implementation note checks, and status-drift warnings when implementation notes already exist.

## Verification Results

```bash
> npm run roadmap:check
Roadmap check passed.
Plans: 18
Implementation notes: 10
Missing: 0
Warnings: 0
```

```bash
> npm test
Test Files  30 passed (30)
Tests  88 passed (88)
```

```bash
> npm run build
tsc -p tsconfig.json
```

```bash
> npm run lint
eslint .
```

```bash
node dist/scripts/check-roadmap.js
```

Passed in this workspace after `npm run build`.

All verification commands passed.

Commands run:

```bash
npm run roadmap:check
npm test
npm run build
npm run lint
```

Current reruns in this workspace are blocked by native dependency mismatches before the roadmap checker can execute:

- `npm run roadmap:check` fails because `esbuild` is installed as `@esbuild/darwin-x64` while the current runtime expects `@esbuild/darwin-arm64`.
- `npm test` fails at startup because `@rolldown/binding-darwin-arm64` is missing from the current install.

## Known Limitations

- The checker enforces required headings for roadmap governance and later phases; pre-governance legacy plan headings are not made blocking by this phase.
- Proposed phases may reference missing plan files without failing the checker.

## Follow-Up Work

- Use `docs/governance/templates/phase.md` for new phases after roadmap governance.
- Use `docs/governance/templates/implementation-note.md` for future implementation notes.
- Keep `docs/governance/implementation-order.md` aligned when phases already have implementation notes or completed verification.

## Plan Deviations

None.
