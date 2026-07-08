# Backlog Item Template

Use this template for future candidate phases before creating a plan document.

Keep the item local-first, deterministic, and evidence-first.

```md
# <Backlog Item Title>

## Title

Short, narrow name for the candidate phase.

## Problem

What concrete workflow, evidence, or reliability problem exists today?

## Proposed Change

What specific change should happen if this item is selected?

## Evidence Basis

List exact local evidence:

- Files:
- Commands:
- Outputs or reports:
- User workflow:
- Known gaps or risks in the current evidence:

## Expected User Value

How this helps the user decide faster, understand evidence better, or complete the workflow with less friction.

## Expected Validation Impact

How this improves evidence quality, confidence, coverage, or decision usefulness.

## Reliability Impact

How this reduces failure risk, operator confusion, brittle behavior, or verification pain.

## Implementation Cost

Rate from `0` to `5`, where:

- `0` = trivial local change
- `3` = moderate scoped work
- `5` = large or unclear implementation

Explain the main cost drivers.

## Dependency Risk

Rate from `0` to `5`, where:

- `0` = almost no prerequisites
- `3` = some sequencing or dependency risk
- `5` = high dependency or external coupling risk

Explain the main dependency concerns.

## Reversibility

Rate from `0` to `5`, where:

- `0` = hard to undo safely
- `3` = reversible with moderate cleanup
- `5` = easy to revert or replace

Explain the rollback shape.

## Non-Goals

List what this item must not include.

## Acceptance Criteria

List observable outcomes that would prove the candidate phase is complete.

## Scoring Worksheet

Rate each dimension from `0` to `5`.

| Dimension | Rating | Notes |
|---|---:|---|
| Evidence impact | 0 | |
| Reliability impact | 0 | |
| User decision speed | 0 | |
| Workflow frequency | 0 | |
| Implementation cost | 0 | |
| Dependency risk | 0 | |
| Reversibility | 0 | |
| Strategic alignment | 0 | |

Score formula:

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

## Priority Decision

- Score:
- Bucket: `do_next` | `schedule` | `research_first` | `defer` | `reject`
- Decision date:
- Decision owner:
- Reason:

## Missing Evidence Follow-Up

If the bucket is `research_first`, record the cheapest local step that would upgrade the decision:

- Required evidence:
- Local command, file review, fixture, or diagnostic to add:
- What decision this would unblock:
```
