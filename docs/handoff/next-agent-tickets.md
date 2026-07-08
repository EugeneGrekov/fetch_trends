# Next-Agent Tickets

## Purpose

This file is the handoff queue for another agent continuing the project.

Use it together with:

- [Implemented features](implemented-features.md)
- [Implementation order](implementation-order.md)
- [Roadmap governance](roadmap-governance.md)
- [Backlog prioritization](backlog-prioritization.md)

## Before Editing

Run:

```bash
git status --short
npm run roadmap:check
npm run backlog:check
```

If implementation work is started, the normal phase gate is:

```bash
npm test
npm run build
npm run lint
```

Do not revert unrelated dirty files. Do not edit ignored generated outputs unless the user explicitly asks.

## Ticket 001 - Verify Scheduled Revalidation Status

Priority: High

Type: verification and documentation

Goal: decide whether scheduled revalidation can be moved from `implemented` to `verified`.

Inputs:

- `docs/features/scheduled-revalidation/plan.md`
- `docs/features/scheduled-revalidation/implementation.md`
- `src/revalidation/`
- `src/commands/revalidate.ts`
- `docs/governance/implementation-order.md`

Implementation steps:

1. Review the implementation note and compare it to the plan acceptance criteria.
2. Run `npm test`, `npm run build`, and `npm run lint`.
3. If checks pass or unrelated failures are documented, update the scheduled revalidation row in `docs/governance/implementation-order.md` to `verified`.
4. If checks fail because of scheduled revalidation, fix the issue or keep status as `implemented` with the failure documented.

Acceptance criteria:

- Verification result is recorded.
- Roadmap status is accurate.
- No unrelated roadmap statuses are changed.

## Ticket 002 - Implement Idea Portfolio

Priority: High

Type: feature implementation

Goal: implement `docs/features/idea-portfolio/plan.md` so the tool can compare multiple validated ideas by evidence strength, risk, cost to test, and next action.

Inputs:

- `docs/features/idea-portfolio/plan.md`
- `src/db/`
- `src/validation/`
- `src/measurement/`
- `src/decision-loop/`
- `docs/recipes/compare-idea-portfolio.md`

Expected work:

1. Add persistence needed for portfolio snapshots or rankings.
2. Add portfolio scoring and comparison modules.
3. Add a CLI command and package script, likely `npm run portfolio`.
4. Add web visibility only if the plan calls for it and the scope remains small.
5. Add tests with deterministic fixtures.
6. Create `docs/features/idea-portfolio/implementation.md`.
7. Update `docs/reference/architecture.md`, `docs/reference/commands.md`, and `docs/governance/implementation-order.md`.

Acceptance criteria:

- Multiple ideas can be ranked from local evidence.
- Ranking explains why an idea is strong, weak, risky, or ready for the next test.
- Tests do not require live external services.
- The phase gate is run and documented.

## Ticket 003 - Implement Data Export And Backup

Priority: High

Type: feature implementation

Goal: implement `docs/features/data-export-and-backup/plan.md` so local validation data can be exported, archived, backed up, and restored.

Inputs:

- `docs/features/data-export-and-backup/plan.md`
- `src/db/`
- `docs/recipes/backup-and-restore.md`
- `docs/features/operator-diagnostics/implementation.md`
- `docs/features/release-packaging/implementation.md`

Expected work:

1. Add export command behavior for ideas, jobs, evidence, reports, measurements, decisions, and artifacts.
2. Add backup and restore flows with clear local filesystem contracts.
3. Add deterministic tests using temporary databases and fixtures.
4. Create `docs/features/data-export-and-backup/implementation.md`.
5. Update command docs, architecture docs, recipes, diagnostics, and release checks.

Acceptance criteria:

- A user can create a backup from a local DB and restore it into a clean local DB.
- Export formats are documented.
- Ignored output directories remain ignored by git.
- Diagnostics and release checks know how to verify the export/backup command surface.

## Ticket 004 - Backfill Dependent Checks After Portfolio And Backup

Priority: Medium

Type: integration hardening

Goal: remove roadmap skip behavior once portfolio and backup are implemented.

Inputs:

- `src/diagnostics/`
- `scripts/release-check.ts`
- `docs/recipes/`
- `docs/reference/release-checklist.md`

Expected work:

1. Add diagnostics for portfolio command availability and backup/export integrity.
2. Add release checks for portfolio and backup command documentation.
3. Update recipes that currently describe planned behavior.
4. Add tests for new checks.

Acceptance criteria:

- Diagnostics no longer skip portfolio or backup when the phases are implemented.
- Release checks fail if portfolio or backup commands are missing from docs.

## Ticket 005 - Select The Next Backlog Item With Evidence

Priority: Medium

Type: planning

Goal: avoid another automatic plan chain by scoring future candidate work before creating the next plan.

Inputs:

- `docs/governance/backlog-prioritization.md`
- `docs/governance/templates/backlog-item.md`
- `docs/status/implemented-features.md`
- `docs/governance/implementation-order.md`

Expected work:

1. Create candidate backlog item files only for real gaps.
2. Score each item by evidence impact, reliability impact, user value, implementation cost, and dependency risk.
3. Pick the highest-value item that can be verified locally.
4. Create one plan document for that selected item.

Acceptance criteria:

- The next plan is justified by backlog scoring.
- The plan has concrete acceptance criteria and local verification commands.

## Ticket 006 - Expand Live Collector Providers Only After Core Local Gaps Close

Priority: Low

Type: optional feature implementation

Goal: add more provider-backed live collectors without weakening local deterministic tests.

Inputs:

- `docs/features/external-collectors/plan.md`
- `src/utilities/reddit/`
- `src/utilities/youtube/`
- `src/utilities/reviews/`
- `src/utilities/competitors/`
- `config/collectors.json`

Expected work:

1. Identify which collectors are currently mock, configured, or provider-backed.
2. Add provider adapters behind explicit configuration and API keys.
3. Keep default tests fixture-only and offline.
4. Document rate limits, failure modes, and blocked collector runs.

Acceptance criteria:

- Missing API keys produce warnings, not failed validation jobs.
- Live collection can be disabled.
- Stored evidence remains source-attributed.

## Recommended Order

1. Ticket 001.
2. Ticket 002.
3. Ticket 003.
4. Ticket 004.
5. Ticket 005.
6. Ticket 006 only after core local workflow gaps are closed.
