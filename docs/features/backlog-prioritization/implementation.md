# Backlog Prioritization Implementation

## Summary

Implemented the backlog prioritization phase as a local documentation and
process feature. The phase adds a backlog prioritization guide, a reusable
backlog item template, an offline backlog checker, and governance links so
future phase planning can start from scored backlog items instead of ad hoc
expansions.

## Files Changed

- `docs/governance/backlog-prioritization.md`
- `docs/governance/templates/backlog-item.md`
- `docs/features/backlog-prioritization/implementation.md`
- `docs/governance/roadmap-governance.md`
- `docs/governance/implementation-order.md`
- `docs/reference/commands.md`
- `docs/reference/architecture.md`
- `package.json`
- `scripts/check-backlog.ts`
- `scripts/backlog-support.ts`
- `scripts/backlog-support.test.ts`

## Commands Added or Changed

- Added `npm run backlog:check`.
- Added direct checker entrypoint `npx tsx scripts/check-backlog.ts`.
- Added optional checker target `npm run backlog:check -- --file docs/backlog/<item>.md`.

## Schema/Migration Changes

None.

## Tests Added or Updated

- Added `scripts/backlog-support.test.ts` for guide headings, template
  headings, and offline backlog item fixture validation.
- Reused existing repository checks that keep `docs/reference/commands.md` aligned with
  `package.json`.

## Verification Results

```bash
npm run backlog:check
```

Failed before the checker executed because `esbuild` is installed as
`@esbuild/darwin-x64` while the current runtime expects
`@esbuild/darwin-arm64`.

```bash
node dist/scripts/check-backlog.js
```

Passed in this workspace after `npm run build`.

```bash
npm test
```

Failed at startup because the current install is missing
`@rolldown/binding-darwin-arm64`.

```bash
npm run build
```

Passed in this workspace.

```bash
npm run lint
```

Passed in this workspace.

## Known Limitations

- The checker validates required document headings and optional backlog item
  files, but it does not enforce scoring truth or rank items automatically.
- The phase does not add a backlog application, issue tracker integration,
  cloud sync, or AI-only prioritization.
- Full verification is currently blocked by local native dependency mismatches
  in `node_modules`, not by TypeScript or documentation structure errors in
  this phase.

## Follow-Up Work

- Add `docs/features/future-integrations/plan.md` as the next planning phase when the
  project is ready to evaluate optional external integrations.
- Create real backlog items under `docs/backlog/` when new candidate phases are
  proposed.

## Plan Deviations

None so far. This implementation stays within the docs-first scope and adds the
optional offline checker described by the plan.
