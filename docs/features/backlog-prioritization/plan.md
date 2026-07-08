# Backlog Prioritization Plan

## Goal

After roadmap governance exists, add a practical backlog prioritization system
for ranking future candidate work by evidence impact, reliability impact, user
decision speed, implementation cost, and dependency risk.

This phase should help the project decide what to plan or implement next
without defaulting to novelty, external trend pressure, or the loudest request.

Core rule:

```text
Prioritize work that improves evidence quality, reliability, or decision speed.
Do not prioritize novelty without local evidence.
```

## Prerequisite

Complete and verify:

```text
docs/features/roadmap-governance/plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- Roadmap lifecycle rules in `docs/governance/implementation-order.md`.
- Phase and implementation-note templates.
- Architecture and workflow documentation for the evidence-first system.
- Local verification rules that do not depend on live external services.

## Non-Goals

Do not add these in this phase:

- New product validation features.
- New external collectors.
- Cloud project management integration.
- GitHub issue synchronization.
- Multi-user voting or approvals.
- AI-only prioritization that bypasses documented evidence.
- Product analytics or telemetry integrations.
- A complex backlog web app.

This phase is local prioritization guidance and optional offline validation
support only.

## Target Structure

Create or update:

```text
docs/governance/backlog-prioritization.md
docs/governance/templates/backlog-item.md
docs/features/backlog-prioritization/implementation.md
docs/governance/implementation-order.md
```

Optional if the implementation remains small and deterministic:

```text
scripts/check-backlog.ts
```

The target outcome is documentation-first. If a checker is added, it should
validate backlog structure offline rather than introducing a new product
subsystem.

## Implementation Steps

### Step 1: Define The Backlog Item Shape

Create `docs/governance/templates/backlog-item.md` as the required starting point for future
candidate phases.

Required sections:

- Title.
- Problem.
- Proposed Change.
- Evidence Basis.
- Expected User Value.
- Expected Validation Impact.
- Reliability Impact.
- Implementation Cost.
- Dependency Risk.
- Reversibility.
- Non-Goals.
- Acceptance Criteria.
- Scoring Worksheet.
- Priority Decision.
- Missing Evidence Follow-Up.

Each item must stay narrow enough to become one phase plan if selected.

### Step 2: Define The Evidence Standard

Document what counts as acceptable local evidence before scoring:

- Existing plans, implementation notes, and architecture docs.
- Reproducible command output.
- Repeated workflow friction in CLI or local web flows.
- Deterministic verification failures or diagnostic output.
- Stored reports, evidence, or artifacts that show a real decision gap.

Document weak evidence that should not justify a high score:

- Speculative convenience requests.
- "Other tools have this" arguments without local workflow proof.
- Novel integrations without a demonstrated decision or reliability gap.
- Vague future ideas with no local files, commands, or reports behind them.

Missing or weak evidence should push an item to `research_first`, `defer`, or
`reject`.

### Step 3: Define The Scoring Model

Use one deterministic 100-point score per backlog item.

Each dimension should be rated from `0` to `5`:

- `0`: none, unknown, or actively harmful.
- `1`: very weak.
- `2`: limited.
- `3`: meaningful.
- `4`: strong.
- `5`: critical or clearly high-value.

Required weighted dimensions:

| Dimension | Weight | Direction |
|---|---:|---|
| Evidence impact | 20 | Higher is better |
| Reliability impact | 20 | Higher is better |
| User decision speed | 15 | Higher is better |
| Workflow frequency | 10 | Higher is better |
| Implementation cost | 15 | Lower is better |
| Dependency risk | 10 | Lower is better |
| Reversibility | 5 | Higher is better |
| Strategic alignment | 5 | Higher is better |

Use a documented formula that penalizes cost and dependency risk while keeping
the total bounded at `100`.

### Step 4: Define Priority Buckets And Overrides

Use exactly one bucket per item:

```text
do_next
schedule
research_first
defer
reject
```

Document:

- Default score ranges for each bucket.
- Override rules when evidence is missing.
- Override rules when prerequisites are not yet verified.
- Override rules when a proposal conflicts with local-first,
  evidence-first architecture.

The bucket must remain a human decision with explicit reasons, not an automatic
score-only outcome.

### Step 5: Add The Backlog Prioritization Guide

Create `docs/governance/backlog-prioritization.md` to explain:

- When to create a backlog item.
- How to write one from local evidence.
- How to score consistently.
- How to handle unknowns conservatively.
- How to choose the next phase when several items compete.
- How to defer, reject, and revisit items without losing history.
- How an item moves from backlog candidate to
  `docs/features/<feature-name>/plan.md`.

This guide should tie prioritization back to the evidence-first validation
system so new work strengthens decision quality instead of expanding surface
area for its own sake.

### Step 6: Wire Roadmap References

Update roadmap references so backlog prioritization fits the documented phase
lifecycle:

- `docs/governance/implementation-order.md` should show the phase as planned once the plan
  exists.
- The roadmap should no longer describe this plan as the next missing phase
  after the file is created.
- Any governance references to prioritization should point to the backlog guide
  rather than inventing a second prioritization process.

Keep these edits minimal and documentation-only.

### Step 7: Optional Offline Checker

If the repository already has lightweight documentation check patterns, add an
optional checker such as:

```bash
npm run backlog:check
```

The checker may validate:

- Required headings in backlog item files.
- Presence of scoring fields.
- Valid bucket names.
- Consistency between score and recorded bucket when no override reason exists.

If the checker would add disproportionate maintenance burden, defer it and
document that decision in the implementation note.

## Data / API / CLI Contracts

This phase should not change runtime product behavior, database schema, or live
collector contracts.

Documentation contract for each backlog item:

```text
Title
Problem
Proposed Change
Evidence Basis
Expected User Value
Expected Validation Impact
Reliability Impact
Implementation Cost
Dependency Risk
Reversibility
Non-Goals
Acceptance Criteria
Scoring Worksheet
Priority Decision
Missing Evidence Follow-Up
```

Recommended scoring formula:

```text
score =
  (evidence_impact * 4) +
  (reliability_impact * 4) +
  (user_decision_speed * 3) +
  (workflow_frequency * 2) +
  ((5 - implementation_cost) * 3) +
  ((5 - dependency_risk) * 2) +
  (reversibility * 1) +
  (strategic_alignment * 1)
```

Optional checker command:

```bash
npm run backlog:check
```

Optional machine-readable result:

```json
{
  "title": "Example candidate phase",
  "score": 74,
  "bucket": "schedule",
  "overrideReason": null,
  "warnings": []
}
```

Compatibility requirements:

- Work fully offline by default.
- Do not require live Codex, network access, or external SaaS.
- Keep backlog files readable as plain Markdown even if a checker is added.

## Testing Plan

Add or update tests/checks for:

- Required sections in `docs/governance/templates/backlog-item.md`.
- Required guidance in `docs/governance/backlog-prioritization.md`.
- Score math if a checker is implemented.
- Bucket validation if a checker is implemented.
- Clear warnings for missing evidence fields if a checker is implemented.
- Roadmap reference consistency if backlog prioritization changes the
  implementation-order status or next-missing-doc note.

Default tests must not call:

- Live external APIs.
- Live Codex.
- Network services.
- Payment providers.

Use documentation fixtures or small local examples if checker coverage is added.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

If implemented:

```bash
npm run backlog:check
```

## Acceptance Criteria

- `docs/features/backlog-prioritization/plan.md` defines a complete implementation-ready
  phase.
- `docs/governance/backlog-prioritization.md` explains how backlog items are created,
  scored, bucketed, deferred, rejected, and promoted to a plan.
- `docs/governance/templates/backlog-item.md` gives one deterministic template for future
  candidate phases.
- The scoring model explicitly favors evidence quality, reliability, and user
  decision speed over novelty.
- Missing evidence handling is documented and pushes uncertain work toward
  `research_first`, `defer`, or `reject`.
- Roadmap references remain consistent with the existence of the plan.
- No runtime product behavior changes are introduced by this phase.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Scoring can create false precision and hide judgment calls.
  Mitigation: document the score as a decision aid, not an automatic verdict.
- Backlog items can become stale after major roadmap changes.
  Mitigation: require dated decision notes and explicit revisit rules.
- A checker can become bureaucracy if it is stricter than the docs need.
  Mitigation: keep the checker optional and limited to structural validation.
- Teams can optimize for score instead of validation usefulness.
  Mitigation: keep evidence quality, reliability, and local decision value as
  the first tie-breakers.

## Recommended Next Phase

After backlog prioritization exists, the next phase should be the highest-value
backlog item that scores into `do_next` and has concrete local evidence.

Do not preselect a future feature in this plan. Promote the winning backlog
item into its own `docs/features/<feature-name>/plan.md` only after scoring and bucket
review are complete.
