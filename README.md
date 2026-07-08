# fetch_trends

## Project Name

Local Google Autocomplete research CLI for validating search language around micro-business ideas.

## Scope

- Keep changes focused on the CLI, its analysis pipeline, and its output format.
- Do not edit generated or external data unless the user explicitly asks.
- Treat `HOWTO/` as working documentation for the project rather than product content.

## Working Notes

- `npm run autocomplete` runs the CLI directly from source.
- `npm run build` emits compiled output into `dist/`.
- `npm test` runs the Vitest suite.

## Feature Documentation Standard

Every substantial feature, refactor phase, or architecture phase should have a dedicated plan document before implementation.

Use this path format:

```text
docs/features/<feature-name>/plan.md
```

Use lowercase kebab-case for `<feature-name>`.

Examples:

```text
docs/features/autocomplete-refactor/plan.md
docs/features/sqlite-foundation/plan.md
docs/features/ai-runner/plan.md
```

Each feature plan should use this structure:

```text
# <Feature Name> Plan

## Goal
What this phase adds and why it exists.

## Prerequisite
What must already be implemented and verified.

## Non-Goals
What must not be added in this phase.

## Target Structure
Files, folders, commands, modules, or data structures to create or change.

## Implementation Steps
Ordered, concrete steps.

## Data / API / CLI Contracts
Schemas, command examples, inputs, outputs, and compatibility requirements.

## Testing Plan
Tests to add or update. Default tests must not depend on live external services.

## Verification
Commands to run, normally:
  npm test
  npm run build
  npm run lint

## Acceptance Criteria
Observable conditions that prove the phase is complete.

## Risks
Known implementation risks and mitigations.

## Recommended Next Phase
The next document or implementation phase after this one.
```

Documentation rules:

- Keep feature docs practical and implementation-ready.
- Keep docs in `docs/`; keep `HOWTO/` as working reference material.
- Every implementation job must document what was actually implemented.
  Prefer a separate implementation note:

```text
docs/features/<feature-name>/implementation.md
```

- Implementation notes should include:
  - summary of what changed
  - files/modules added or changed
  - commands added or changed
  - schema/migration changes, if any
  - tests added or updated
  - verification results for `npm test`, `npm run build`, and `npm run lint`
  - known limitations
  - follow-up work
- Update `docs/reference/architecture.md` when a feature changes module boundaries,
  persistence, command structure, AI behavior, or web architecture.
- Keep a short `README.md` in each project-owned directory explaining purpose,
  boundaries, and ownership. Skip ignored generated directories such as
  `results/`, `artifacts/`, `exports/`, `backups/`, `dist/`, and
  `node_modules/` unless the user explicitly asks.
- Update the original `docs/features/<feature-name>/plan.md` only when implementation
  intentionally diverges from the plan, when scope is deferred, or when
  acceptance criteria change. Do not rewrite the plan just to narrate completed
  work; put completion details in the implementation note.
- Do not mix unrelated implementation into a documentation-only change.
- If implementation diverges from a feature plan, update the plan or record the
  decision in the relevant architecture document.

## Status

Initialized as a local git repository.
