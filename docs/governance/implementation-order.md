# Implementation Order

## Purpose

This file records the planned order of implementation phases for the evidence-first micro-business validator.

The sequence matters because each phase creates the foundation for the next one. Do not jump to later phases before the prerequisite phase is implemented and verified or explicitly deferred.

## Status Lifecycle

Use the lifecycle defined in [roadmap-governance.md](roadmap-governance.md):

| Status | Use When |
|---|---|
| `proposed` | Candidate work is identified but not ready for implementation. |
| `planned` | A plan exists and the phase is eligible after prerequisites pass. |
| `delegated` | The user or coordinator assigned the phase to an implementation agent. |
| `in_progress` | An agent is actively editing for the phase. |
| `implemented` | The phase has implementation output and an implementation note. |
| `verified` | Required verification passed or unrelated failures are documented. |
| `deferred` | The phase remains valid but is intentionally postponed. |
| `retired` | The phase or feature is no longer maintained. |
| `superseded` | A later phase replaces this phase. |
| `blocked` | Work cannot proceed without an external decision or missing prerequisite. |

Use exactly one status per phase. Do not use ad hoc status combinations such as `Created / delegated`.

## Order

| Order | Phase | Plan Document | Purpose | Status |
|---:|---|---|---|---|
| 0 | Architecture and roadmap | `docs/features/architecture-roadmap/plan.md`, `docs/reference/architecture.md` | Define product direction, module boundaries, and validation model. | `verified` |
| 1 | Autocomplete utility refactor | `docs/features/autocomplete-refactor/plan.md` | Move existing autocomplete functionality into `src/utilities/autocomplete/` without behavior changes. | `verified` |
| 2 | SQLite foundation | `docs/features/sqlite-foundation/plan.md` | Store ideas, jobs, tool runs, queries, autocomplete predictions, scores, and reports locally. | `verified` |
| 3 | AI runner | `docs/features/ai-runner/plan.md` | Use bounded Codex calls to normalize ideas, generate queries, summarize evidence, and draft reports from stored evidence. | `verified` |
| 4 | Codex skills | `docs/features/codex-skills/plan.md` | Add project-local skills that call the local CLI/pipeline and summarize stored reports. | `verified` |
| 5 | External collectors | `docs/features/external-collectors/plan.md` | Add SERP, Reddit/forum, YouTube, competitor, and review evidence collectors. | `verified` |
| 6 | Web interface | `docs/features/web-interface/plan.md` | Add a local UI for submitting ideas, watching jobs, inspecting evidence, and reading reports. | `verified` |
| 7 | Payment test and SEO outputs | `docs/features/payment-test-and-seo/plan.md` | Generate landing page drafts, fake-door/preorder specs, analytics plans, SEO clusters, and thresholds. | `verified` |
| 8 | Post-launch measurement | `docs/features/post-launch-measurement/plan.md` | Store real validation behavior and compare results against thresholds. | `verified` |
| 9 | Pivot/persevere loop | `docs/features/pivot-persevere-loop/plan.md` | Turn measurement reports into repeatable pivot, persevere, validate deeper, or kill workflows. | `verified` |
| 10 | Idea portfolio | `docs/features/idea-portfolio/plan.md` | Compare multiple ideas by evidence strength, risk, cost to test, and best next action. | `planned` |
| 11 | Scheduled revalidation | `docs/features/scheduled-revalidation/plan.md` | Detect stale evidence, periodically re-run validation jobs, and queue follow-up work. | `implemented` |
| 12 | Data export and backup | `docs/features/data-export-and-backup/plan.md` | Export, archive, back up, and restore local validation evidence and reports. | `planned` |
| 13 | Operator diagnostics | `docs/features/operator-diagnostics/plan.md` | Inspect configuration, failed jobs, DB health, collector availability, and artifact integrity. | `verified` |
| 14 | Release packaging | `docs/features/release-packaging/plan.md` | Make the CLI, web app, skills, docs, and migrations easier to install, run, verify, and distribute. | `verified` |
| 15 | Workflow recipes | `docs/features/workflow-recipes/plan.md` | Document common end-to-end workflows for validation, portfolio review, payment tests, revalidation, and backup. | `verified` |
| 16 | Quality hardening | `docs/features/quality-hardening/plan.md` | Improve regression coverage, fixture stability, migration compatibility, command consistency, and technical-debt cleanup. | `verified` |
| 17 | Roadmap governance | `docs/features/roadmap-governance/plan.md` | Define how future phases are proposed, prioritized, implemented, verified, documented, and retired. | `verified` |
| 18 | Backlog prioritization | `docs/features/backlog-prioritization/plan.md` | Rank future candidate work by evidence impact, reliability impact, user value, implementation cost, and dependency risk. | `verified` |

## Adding A Phase

To add a phase:

1. Create `docs/features/<feature-name>/plan.md` from [templates/phase.md](templates/phase.md).
2. Add one row to the order table with status `proposed` or `planned`.
3. Place it after real prerequisites, not just at the end by default.
4. Keep non-goals explicit so implementation agents can reject scope creep.
5. Update the dependency chain only when the new phase changes sequencing.

Do not add a phase just to restate unresolved work from another plan.

## Marking A Phase Delegated

Use `delegated` when the user or coordinating agent assigns a planned phase to an implementation agent.

Rules:

- The plan document must already exist.
- The delegation request is the owner record for the active job.
- The implementation agent may change the status to `in_progress` when editing starts.
- If the agent cannot start because prerequisites are missing, use `blocked` and document why.

Do not mark unrelated phases delegated just because other agents are active in the repository.

## Marking A Phase Implemented

Use `implemented` only when:

- The scoped files are changed.
- `docs/features/<feature-name>/implementation.md` exists.
- The implementation note documents files changed, commands, tests, verification status, limitations, follow-up work, and plan deviations.

Use `verified` only after required checks pass or failures are clearly documented as pre-existing or unrelated.

## Concurrent Agent Rules

Multiple agents may work in the repository at the same time.

Required behavior:

- Run `git status --short` before editing.
- Read currently modified files before changing them.
- Build on current file contents instead of assuming `HEAD`.
- Do not revert edits you did not make.
- Stage and commit only scoped changes.
- If another agent modifies the same lines needed for your phase, stop and ask for coordination unless the merge is obvious and low risk.

Generated data and external outputs should remain untouched unless the user explicitly asks.

## Skipped, Deferred, Superseded, And Retired Phases

Do not silently remove roadmap rows.

Use:

- `deferred` when the phase remains valid but should wait.
- `superseded` when another phase replaces the planned approach.
- `retired` when the phase or feature should no longer be maintained.
- `blocked` when implementation cannot continue without a missing prerequisite or external decision.

Record the reason in the phase plan, implementation note, or architecture document. If a phase is superseded, name the replacing phase.

## Avoiding Infinite Planning Loops

Stop planning and implement when a phase has:

- A goal.
- Prerequisites.
- Non-goals.
- Target structure.
- Concrete implementation steps.
- Data, API, or CLI contracts.
- A testing plan.
- Verification commands.
- Acceptance criteria.
- Risks.

Create another plan only when the next decision cannot be made safely from the current plan. Planning documents should narrow implementation, not defer it forever.

## Dependency Chain

```text
Architecture
  -> Autocomplete utility refactor
  -> SQLite foundation
  -> AI runner
  -> Codex skills
  -> External collectors
  -> Web interface
  -> Payment test and SEO outputs
  -> Post-launch measurement
  -> Pivot/persevere loop
  -> Idea portfolio
  -> Scheduled revalidation
  -> Data export and backup
  -> Operator diagnostics
  -> Release packaging
  -> Workflow recipes
  -> Quality hardening
  -> Roadmap governance
  -> Backlog prioritization
```

## Phase Gates

Each implementation phase must finish with:

```bash
npm test
npm run build
npm run lint
```

If a command fails:

- Fix failures introduced by the current phase.
- If the failure is pre-existing or caused by concurrent unrelated work, document it in the implementation note.
- Do not mark the phase `verified` without a clear verification status.

## Documentation Rules

Each phase should have:

- A plan document before implementation.
- An implementation note after implementation.
- Updated architecture documentation if module boundaries, commands, persistence, AI behavior, or web behavior changed.

Recommended implementation note format:

```text
docs/features/<feature-name>/implementation.md
```

Examples:

```text
docs/features/autocomplete-refactor/implementation.md
docs/features/sqlite-foundation/implementation.md
docs/features/ai-runner/implementation.md
```

## Next Missing Document

No active phase is missing its required plan document.

No next proposed phase is recorded yet.
