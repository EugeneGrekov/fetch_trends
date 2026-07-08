# Idea Portfolio Plan

## Goal

After the pivot/persevere loop exists, add portfolio-level comparison so the user can evaluate multiple ideas against each other by evidence strength, risk, cost to test, and best next action.

This phase should help decide where to spend the next validation cycle.

Core rule:

```text
Do not rank ideas by excitement.
Rank ideas by evidence quality, risk, test cost, and next action clarity.
```

## Prerequisite

Complete and verify:

```text
docs/features/pivot-persevere-loop/plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- Ideas.
- Validation reports.
- Payment-test and SEO outputs.
- Post-launch measurement.
- Pivot/persevere decisions.
- Decision memos.
- Learning history per idea.

## Non-Goals

Do not add these in this phase:

- Team collaboration.
- Cloud sync.
- Investor-style market sizing.
- Automated product building.
- Paid ads optimization.
- Public dashboards.
- Multi-user permissions.

This phase is a local decision dashboard for comparing ideas.

## Target Structure

Create:

```text
src/portfolio/
  portfolio-scorer.ts
  portfolio-ranker.ts
  comparison-report.ts
  types.ts

src/commands/
  portfolio.ts

prompts/
  portfolio-summary.md
```

Optional web additions:

```text
src/web/routes/portfolio.ts
src/web/views/portfolio-dashboard.ts
```

Optional docs:

```text
docs/features/idea-portfolio/implementation.md
```

## Implementation Steps

### Step 1: Define Portfolio Inputs

Portfolio ranking should read existing data:

- Idea metadata.
- Latest validation score.
- Latest report.
- Latest experiment decision.
- Latest measurement snapshot.
- Kill rules.
- Missing proof.
- Next action.
- Cost-to-test estimate when available.

Do not require every idea to have every data type. Missing evidence should reduce confidence.

### Step 2: Add Portfolio Scoring

Create a portfolio score that is separate from the idea validation score.

Suggested dimensions:

| Dimension | Meaning |
|---|---|
| Evidence strength | How much direct evidence exists. |
| Search intent strength | Quality of autocomplete/SERP/query intent. |
| Payment signal strength | Paid competitors, payment clicks, preorder, or proxy signals. |
| Technical simplicity | Build/test complexity. |
| Trust/support simplicity | Permission, privacy, and support burden. |
| Test cost | Time/money required for next validation step. |
| Decision clarity | Whether the next action is obvious. |
| Recency | Whether evidence is current. |

The score should not hide kill rules.

### Step 3: Add Portfolio Ranking

Rank ideas into practical buckets:

```text
test_next
validate_deeper
watch
park
kill
```

Ranking should include:

- Portfolio score.
- Confidence level.
- Reason.
- Best next action.
- Blocking missing proof.

### Step 4: Add Comparison Report

Generate a Markdown/JSON comparison report.

Required sections:

- Top ideas to test next.
- Ideas to validate deeper.
- Ideas to park.
- Ideas to kill.
- Cross-idea risks.
- Shared missing proof.
- Recommended next validation cycle.

The report should be decision-oriented, not a generic summary.

### Step 5: Add CLI Command

Add:

```bash
npm run portfolio
```

Optional filters:

```bash
npm run portfolio -- --status active
npm run portfolio -- --limit 10
npm run portfolio -- --include-killed false
```

Expected output:

```text
Portfolio report generated:
Report ID: <id>
Top next action: Test <idea title> because <reason>.
```

### Step 6: Add Optional Web Dashboard

If web UI exists, add a local portfolio page:

```text
/portfolio
```

Show:

- Ideas table.
- Rank bucket.
- Score.
- Confidence.
- Latest decision.
- Next action.
- Missing proof.

Keep this optional in the first implementation if CLI/report coverage is enough.

## Data / API / CLI Contracts

### Portfolio Score Output

```json
{
  "ideaId": 123,
  "title": "Automatic parked car location saver",
  "bucket": "validate_deeper",
  "portfolioScore": 68,
  "confidence": "medium",
  "reason": "Strong search-language evidence but no real payment behavior yet.",
  "bestNextAction": "Run payment-intent test for top exact-task page.",
  "blockingMissingProof": [
    "No payment-click data",
    "No competitor review evidence"
  ],
  "killRules": []
}
```

### CLI

```bash
npm run portfolio -- --limit 20
```

Output should include:

- Report ID/path.
- Top 3 ideas by bucket.
- One recommended next action.

## Testing Plan

Add tests for:

- Portfolio scoring with complete evidence.
- Portfolio scoring with missing evidence.
- Kill-rule override.
- Ranking into buckets.
- Comparison report generation.
- CLI command with temp SQLite DB.
- Optional web route if implemented.

Default tests must not call:

- Live Codex.
- External APIs.
- Payment providers.
- Analytics services.

Use fixture ideas, reports, scores, decisions, and measurement snapshots.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

Optional manual smoke test:

```bash
npm run portfolio
```

## Acceptance Criteria

- Portfolio scoring exists.
- Portfolio ranking buckets exist.
- Comparison report can be generated.
- CLI command can produce a portfolio report.
- Missing evidence reduces confidence.
- Kill rules are visible and not hidden by aggregate scores.
- Best next action is singular and concrete.
- Optional web dashboard does not duplicate scoring logic.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Portfolio score can create false precision.
- Older ideas may rank highly with stale evidence.
- Weak ideas can look attractive if aggregate scores hide kill rules.
- Comparing ideas across different evidence depth can be misleading.
- Users may optimize for score instead of learning speed.

Mitigations:

- Show confidence and missing proof.
- Include evidence recency.
- Keep kill rules separate.
- Bucket ideas by action, not just score.
- Recommend one next validation cycle.

## Recommended Next Phase

After portfolio comparison works, add scheduled revalidation and automation:

```text
docs/features/scheduled-revalidation/plan.md
```

That phase should support stale-evidence detection, periodic re-runs, and queued follow-up validation jobs.
