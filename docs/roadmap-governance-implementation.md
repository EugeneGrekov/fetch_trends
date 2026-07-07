# Roadmap Governance Implementation

## Summary

Implemented local roadmap governance for future phases. The phase adds lifecycle guidance, practical templates, hardened implementation-order rules, and an offline roadmap checker.

## Files Changed

- `docs/roadmap-governance.md`
- `docs/phase-template.md`
- `docs/implementation-note-template.md`
- `docs/implementation-order.md`
- `docs/roadmap-governance-implementation.md`
- `docs/architecture.md`
- `docs/commands.md`
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

- Added `scripts/roadmap-support.test.ts` for required headings, implementation-order parsing, next-missing handling, and implemented-phase implementation note checks.

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

All verification commands passed.

Commands run:

```bash
npm run roadmap:check
npm test
npm run build
npm run lint
```

## Known Limitations

- The checker enforces required headings for roadmap governance and later phases; pre-governance legacy plan headings are not made blocking by this phase.
- Proposed phases may reference missing plan files without failing the checker.

## Follow-Up Work

- Use `docs/phase-template.md` for new phases after roadmap governance.
- Use `docs/implementation-note-template.md` for future implementation notes.
- Create or reconcile backlog prioritization in a separate phase.

## Plan Deviations

None.
