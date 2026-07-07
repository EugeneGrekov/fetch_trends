# Roadmap Governance

## Purpose

Roadmap governance keeps future work tied to evidence, verification, and a clear end state.

Core rule:

```text
The roadmap is a decision system.
Every phase needs scope, owner, evidence, verification, and a retirement path.
```

This document governs feature phases recorded in [implementation-order.md](implementation-order.md).

## Phase Lifecycle

| Status | Meaning | Who Can Change It |
|---|---|---|
| `proposed` | Candidate work exists as an idea or next phase, but it is not ready for implementation. | Maintainer or coordinating agent. |
| `planned` | A plan document exists and the phase is eligible for implementation after prerequisites pass. | Maintainer or planning agent. |
| `delegated` | The user or coordinator assigned the phase to an implementation agent. | User, maintainer, or coordinating agent. |
| `in_progress` | An agent is actively implementing the phase in the working tree. | Assigned implementation agent. |
| `implemented` | Code/docs are changed and an implementation note exists, but final verification is not fully accepted yet. | Assigned implementation agent. |
| `verified` | Required checks passed or failures are documented as unrelated/pre-existing. | Assigned implementation agent or maintainer. |
| `deferred` | The phase remains valid but is intentionally postponed. | User, maintainer, or coordinating agent. |
| `retired` | The phase or feature is no longer maintained and has a documented reason. | User or maintainer. |
| `superseded` | A newer phase replaces this one. | User, maintainer, or coordinating agent. |
| `blocked` | Work cannot proceed without an external decision, prerequisite, or missing dependency. | Assigned implementation agent or maintainer. |

Use exactly one lifecycle status per phase in `docs/implementation-order.md`.

## Required Phase Evidence

Each phase must identify:

- Scope: the plan document defines what is in and out.
- Owner: the current implementer from the user request, delegation note, or maintainer decision.
- Evidence: plans and implementation notes must point to concrete files, commands, schemas, outputs, or user workflows.
- Verification: implementation notes must record `npm test`, `npm run build`, and `npm run lint`.
- Retirement path: the governance or phase plan must state when the phase can be deferred, retired, or superseded.

Do not invent permanent assignees. Ownership is the active responsibility for the current implementation job.

## Adding A Phase

1. Create `docs/<feature-name>-plan.md` from [phase-template.md](phase-template.md).
2. Add the phase to [implementation-order.md](implementation-order.md) with status `proposed` or `planned`.
3. Put it after phases that provide its real prerequisites.
4. Keep the phase narrow enough to verify with local checks.
5. Do not add implementation files until the plan is accepted or delegated.

New plans after roadmap governance must use the required headings in the phase template.

## Delegating A Phase

When a user delegates work to an agent:

- Change the phase status to `delegated` only if the plan exists.
- The agent may change it to `in_progress` when editing starts.
- Concurrent agents must inspect `git status` and read currently modified files before editing.
- Do not claim ownership of phases assigned to other agents.
- Do not revert unrelated edits from other agents.

If two agents need the same file, the later agent must read the current file and build on it or ask for coordination.

## Implementing A Phase

Implementation must stay inside the phase plan.

Required implementation outputs:

- Files changed for the scoped phase.
- `docs/<feature-name>-implementation.md` from [implementation-note-template.md](implementation-note-template.md).
- Architecture updates when module boundaries, persistence, command structure, AI behavior, or web architecture change.
- Plan updates only when scope, acceptance criteria, or intentional deviations change.

Do not mix backlog prioritization, new collectors, cloud integrations, issue tracker sync, multi-user assignment, or AI-only prioritization into roadmap governance.

## Verifying A Phase

Default verification commands:

```bash
npm test
npm run build
npm run lint
```

If the roadmap checker is available, also run:

```bash
npm run roadmap:check
```

Failures introduced by the current phase must be fixed before marking the phase `verified`.

If a failure is pre-existing or caused by concurrent unrelated work, document:

- The exact command.
- The failure summary.
- Why it is unrelated to the current phase.
- Any follow-up needed.

## Prioritization Rules

Future phases should be prioritized in this order:

1. Fix broken verification first.
2. Preserve existing user workflows.
3. Improve evidence quality.
4. Improve reliability and observability.
5. Add user-facing convenience.
6. Add optional integrations only after the core local flow is stable.

Do not prioritize novelty without evidence.

## Retirement Rules

A phase or feature can be retired when it is:

- Superseded by a better implementation.
- No longer aligned with evidence-first validation.
- Too costly to maintain.
- Creating false confidence.
- Dependent on external services that do not fit local-first constraints.

Retirement must be explicit. Record the reason in the relevant plan, implementation note, or architecture document and update `docs/implementation-order.md`.

## Skipped Or Superseded Phases

Do not delete skipped phases from the order table.

Use:

- `deferred` when the phase remains useful but should wait.
- `superseded` when a later phase replaces it.
- `retired` when it should no longer be maintained.
- `blocked` when implementation cannot continue without an external decision or prerequisite.

The status update must include a short note in the phase plan, implementation note, or architecture document.

## Avoiding Infinite Planning Loops

Planning must stop and implementation must begin when:

- The phase has a goal, non-goals, target structure, implementation steps, tests, verification, and acceptance criteria.
- Open questions do not affect the first safe local implementation slice.
- The next work item can be verified without live services.

Create a new planning phase only when a real decision is missing. Do not add another plan just to restate unresolved work.

## Roadmap Checker

The offline checker verifies roadmap structure without calling live services.

Primary command:

```bash
npm run roadmap:check
```

Direct command:

```bash
npx tsx scripts/check-roadmap.ts
```

The checker reports missing required docs, required heading gaps, implementation-note gaps, and implementation-order consistency warnings.
