# Backlog Prioritization

## Purpose

Backlog prioritization decides which future phase should be planned or implemented next.

Core rule:

```text
Prioritize work that improves validation quality, reliability, or user decision speed.
Do not prioritize novelty without evidence.
```

This document is local-first, deterministic, and evidence-first. Use it to turn candidate work into comparable backlog items before creating a new phase plan.

## Inputs

Prioritization should rely on local project evidence only:

- Existing plans, implementation notes, architecture docs, and workflow docs in `docs/`.
- Current commands, outputs, fixtures, and tests in the repository.
- Reproducible user workflow pain seen in the local CLI or local web interface.
- Concrete failure modes from deterministic local verification.

Do not treat vague ideas, trend-chasing, or external novelty as sufficient evidence.

## When To Create A Backlog Item

Create a backlog item when:

- A useful next phase is visible but not yet planned.
- Several candidate improvements compete for the same implementation slot.
- A recurring workflow problem exists across multiple phases.
- A proposed feature needs research or evidence before it deserves a plan.

Do not create a backlog item for work that is already delegated or in progress. Handle that work through the phase plan and implementation note instead.

## Writing A Backlog Item

Create the item from [templates/backlog-item.md](templates/backlog-item.md).

Required rules:

- Keep the title narrow enough to become one phase plan.
- State the problem as an observed workflow gap, reliability gap, or evidence gap.
- Name the proposed change without embedding unrelated future work.
- Cite the evidence basis with exact local files, commands, outputs, or workflows.
- Write non-goals so later implementers can reject scope creep.
- Keep acceptance criteria observable and locally verifiable.

If the item cannot satisfy those rules, it is not ready for scoring.

## Evidence Standard

Evidence quality matters more than idea quality.

Acceptable evidence:

- A broken or slow local workflow that can be reproduced.
- Repeated manual steps documented in repo workflows.
- Gaps called out by an existing plan, implementation note, or architecture document.
- Verification failures or diagnostics that show a real reliability issue.
- Stored reports or outputs that prove the current decision loop is too slow or unclear.

Weak evidence:

- "This would be nice."
- "Other tools have it."
- "We might need this later."
- "An integration could be useful someday."

Weak evidence should push the item to `research_first`, `defer`, or `reject`.

## Scoring Model

Use one deterministic 100-point score per item.

Each dimension gets a raw rating from `0` to `5`.

- `0`: none, unknown, or actively harmful.
- `1`: very weak.
- `2`: limited.
- `3`: meaningful.
- `4`: strong.
- `5`: critical or clearly high-value.

Weights:

| Dimension | Weight | Notes |
|---|---:|---|
| Evidence impact | 20 | Improves evidence quality, coverage, or confidence. |
| Reliability impact | 20 | Reduces failure risk, ambiguity, or operator error. |
| User decision speed | 15 | Helps the user reach a decision faster. |
| Workflow frequency | 10 | Affects common workflows more than edge cases. |
| Implementation cost | 15 | Higher cost reduces score. |
| Dependency risk | 10 | Higher dependency risk reduces score. |
| Reversibility | 5 | Safer to undo means better candidate. |
| Strategic alignment | 5 | Fits the evidence-first, local-first product direction. |

Formula:

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

Interpretation:

- Higher evidence, reliability, workflow value, and reversibility increase the score.
- Higher implementation cost and dependency risk decrease the score.
- The maximum score is `100`.

## Dimension Guidance

Use these rules to keep scoring consistent:

| Dimension | `0` | `3` | `5` |
|---|---|---|---|
| Evidence impact | No evidence gain. | Improves one useful evidence path. | Materially improves decision confidence across core flows. |
| Reliability impact | No reliability gain. | Reduces a recurring failure or confusion point. | Protects core workflows or verification. |
| User decision speed | No speed gain. | Shortens one common interpretation step. | Removes a major delay in deciding what to do next. |
| Workflow frequency | Rare edge case. | Affects a regular workflow. | Hits daily or near-default use. |
| Implementation cost | Very large or unclear change. | Moderate scoped work. | Small local change. |
| Dependency risk | Many prerequisites or external coupling. | Some prerequisite or sequencing risk. | Almost no dependency risk. |
| Reversibility | Hard to undo safely. | Undoable with moderate cleanup. | Easy to revert or replace. |
| Strategic alignment | Off-direction. | Partially aligned. | Directly supports the local evidence-first loop. |

For `implementation_cost` and `dependency_risk`, rate the burden directly. The formula handles the inversion.

## Priority Buckets

Map each scored item into exactly one bucket.

| Bucket | Use When |
|---|---|
| `do_next` | Score is high, evidence is concrete, dependencies are clear, and the item can become a narrow local phase now. |
| `schedule` | Score is solid, but another item is more urgent or sequencing suggests later execution. |
| `research_first` | The idea may be good, but evidence, scope, or local feasibility is still missing. |
| `defer` | The item is valid, but current timing, prerequisites, or focus make it a bad next move. |
| `reject` | The item is not aligned, too risky, too speculative, or not worth maintaining. |

Suggested score bands:

| Score | Default Bucket |
|---:|---|
| `80-100` | `do_next` |
| `60-79` | `schedule` |
| `40-59` | `research_first` |
| `20-39` | `defer` |
| `0-19` | `reject` |

Bucket overrides:

- Force `research_first` if the evidence basis is missing, vague, or not locally reproducible.
- Force `defer` if a prerequisite phase is not implemented, verified, or intentionally deferred with a replacement path.
- Force `reject` if the item conflicts with local-first constraints or adds unsupported external dependence.

## Missing Evidence Handling

Missing evidence is not a minor documentation gap. It changes the decision.

When evidence is incomplete:

1. Record what is missing in the backlog item.
2. State the cheapest local step that would resolve the uncertainty.
3. Set the bucket to `research_first` unless the item is already clearly misaligned enough to reject.
4. Avoid inventing score inputs. Unknown inputs should be rated conservatively.

Examples of valid next research:

- Run an existing command and capture current output.
- Compare two local workflows and count manual steps.
- Check existing plans and implementation notes for known blockers.
- Add a tiny diagnostic or fixture before proposing a larger feature phase.

Do not create a full implementation plan just to answer whether the item is worthwhile.

## Choosing The Next Phase

Use this sequence:

1. Remove items already blocked by explicit non-goals, retired directions, or missing prerequisites.
2. Force `research_first` for items with weak evidence.
3. Score the remaining eligible items.
4. Apply bucket rules.
5. Break ties using current roadmap priorities:
   1. Fix broken verification first.
   2. Preserve existing user workflows.
   3. Improve evidence quality.
   4. Improve reliability and observability.
   5. Add user-facing convenience.
   6. Add optional integrations last.
6. Choose the highest-value item that can be verified locally without live external services.

The winning item should usually be the next plan document, not the next vague idea.

## Defer, Reject, And Revisit Rules

Use `defer` when:

- The item is valid, but a prerequisite phase must land first.
- Another item solves a more urgent reliability or evidence gap.
- The current scope is correct, but the timing is wrong.

Use `reject` when:

- The item conflicts with the local-first product direction.
- The expected value is too speculative for the cost or risk.
- The idea mainly adds novelty, integration surface, or maintenance burden without proven workflow benefit.
- A better existing phase already solves the same problem.

Revisit an old item when:

- A prerequisite phase is now verified.
- New local evidence changes the score materially.
- A repeated workflow failure appears in implementation notes or diagnostics.
- The item was previously deferred only for sequencing, not because it lacked value.

When revisiting, keep the old score and reason visible, then add a new dated decision note. Do not silently rescore history.

## From Backlog Item To Phase Plan

A backlog item is ready to become a phase plan when:

- Its evidence basis is concrete and local.
- The bucket is `do_next` or `schedule`.
- The scope can fit one narrow plan.
- Non-goals are explicit.
- Acceptance criteria can be verified with local commands or deterministic fixtures.

Promotion path:

```text
candidate idea
  -> backlog item
  -> scored and bucketed
  -> selected next item
  -> docs/features/<feature-name>/plan.md
  -> delegated implementation
```

Do not skip directly from a suggestion to a large implementation phase.

## Using The Checker

Run the offline documentation check with:

```bash
npm run backlog:check
```

To validate a concrete backlog item file against the template structure, run:

```bash
npm run backlog:check -- --file docs/backlog/<item>.md
```

The checker validates required headings only. It does not decide whether the
score is wise or whether the item should win against a better candidate.

## Maintenance Rules

- Keep backlog items short enough to rescore quickly.
- Update an item when evidence changes, not just when opinions change.
- Prefer one item per decision unit.
- Split oversized items before scoring if they mix reliability, UX, integrations, and research into one score.
- Archive or retire rejected items only through an explicit decision note.

This document is a decision aid, not a substitute for judgment. Use the score to structure tradeoffs, then apply the roadmap rules consistently.
