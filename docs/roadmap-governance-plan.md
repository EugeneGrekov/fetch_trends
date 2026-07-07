# Roadmap Governance Plan

## Goal

After quality hardening exists, add roadmap governance so future phases are proposed, prioritized, implemented, verified, documented, and retired consistently.

This phase should prevent the project roadmap from becoming an unbounded list of loosely connected plans.

Core rule:

```text
The roadmap is a decision system.
Every phase needs scope, owner, evidence, verification, and a retirement path.
```

## Prerequisite

Complete and verify:

```text
docs/quality-hardening-plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- Feature plans.
- Implementation notes.
- Architecture docs.
- Implementation order.
- Release checks.
- Workflow recipes.
- Quality hardening.

## Non-Goals

Do not add these in this phase:

- New product features.
- New collectors.
- New database tables unless needed for local roadmap metadata.
- Cloud project management integration.
- Multi-user assignments.
- Issue tracker synchronization.
- Automated prioritization by AI alone.

This phase is local governance and process documentation.

## Target Structure

Create or update:

```text
docs/roadmap-governance.md
docs/roadmap-governance-implementation.md
docs/implementation-order.md
docs/phase-template.md
docs/implementation-note-template.md
```

Optional:

```text
scripts/check-roadmap.ts
```

## Implementation Steps

### Step 1: Define Phase Lifecycle

Define statuses:

```text
proposed
planned
delegated
in_progress
implemented
verified
deferred
retired
superseded
blocked
```

Define what each status means and who can change it.

### Step 2: Create Phase Template

Create:

```text
docs/phase-template.md
```

It should match the feature documentation standard from `AGENTS.md`.

Required sections:

- Goal.
- Prerequisite.
- Non-Goals.
- Target Structure.
- Implementation Steps.
- Data / API / CLI Contracts.
- Testing Plan.
- Verification.
- Acceptance Criteria.
- Risks.
- Recommended Next Phase.

### Step 3: Create Implementation Note Template

Create:

```text
docs/implementation-note-template.md
```

Required sections:

- Summary.
- Files Changed.
- Commands Added or Changed.
- Schema/Migration Changes.
- Tests Added or Updated.
- Verification Results.
- Known Limitations.
- Follow-Up Work.
- Plan Deviations.

### Step 4: Harden Implementation Order Rules

Update `docs/implementation-order.md` so it defines:

- How to add a phase.
- How to mark a phase delegated.
- How to mark a phase implemented.
- How to handle concurrent agents.
- How to handle skipped or superseded phases.
- How to avoid infinite planning loops.

### Step 5: Add Roadmap Checker

Optional but recommended:

```bash
npm run roadmap:check
```

Checks:

- Every phase has a plan file.
- Every implemented phase has an implementation note.
- The next missing document section matches the table.
- Plan docs contain required headings.
- Implementation notes contain required headings.

The checker should not call live services.

### Step 6: Define Prioritization Rules

Document how future phases are prioritized:

1. Fix broken verification first.
2. Preserve existing user workflows.
3. Improve evidence quality.
4. Improve reliability and observability.
5. Add user-facing convenience.
6. Add optional integrations only after core local flow is stable.

### Step 7: Define Retirement Rules

Document when a phase or feature can be retired:

- Superseded by a better implementation.
- No longer aligned with evidence-first validation.
- Too costly to maintain.
- Creates false confidence.
- Requires external services that do not fit local-first constraints.

Retirement should be documented, not silent.

## Data / API / CLI Contracts

This phase should not change product runtime contracts.

Optional CLI:

```bash
npm run roadmap:check
```

Output:

```text
Roadmap check passed.
Plans: <count>
Implementation notes: <count>
Missing: <count>
Warnings: <count>
```

## Testing Plan

Add tests/checks for:

- Phase template contains required sections.
- Implementation note template contains required sections.
- Implementation order references existing plan files.
- Implemented phases have implementation notes where applicable.
- Next missing document entry is consistent.

Default checks must not call:

- Live external APIs.
- Live Codex.
- Network.
- Payment providers.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

If implemented:

```bash
npm run roadmap:check
```

## Acceptance Criteria

- Roadmap governance doc exists.
- Phase template exists.
- Implementation note template exists.
- Implementation order includes lifecycle/status rules.
- Optional roadmap checker exists or the decision to defer it is documented.
- Future agents can tell how to add, implement, verify, and retire a phase.
- No product behavior changes are introduced.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Governance can become bureaucracy.
- Roadmap checks can become brittle during active development.
- Too many statuses can confuse agents.
- Planning can continue forever without implementation.

Mitigations:

- Keep templates short.
- Make checks warn before failing where practical.
- Keep status definitions concrete.
- Require implementation notes and commits for delegated implementation phases.

## Recommended Next Phase

After roadmap governance exists, create a backlog prioritization plan:

```text
docs/backlog-prioritization-plan.md
```

That phase should define how future candidate work is ranked by evidence impact, reliability impact, user value, implementation cost, and dependency risk.
