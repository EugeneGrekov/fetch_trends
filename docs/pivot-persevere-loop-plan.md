# Pivot Persevere Loop Plan

## Goal

After post-launch measurement exists, add a repeatable decision loop that turns measurement reports into structured next actions: persevere, pivot, validate deeper, build MVP, or kill.

This phase should make validation cumulative. Each idea should accumulate evidence, experiments, decisions, and learning history instead of producing isolated reports.

Core rule:

```text
One report is a snapshot.
The decision loop is the operating system.
```

## Prerequisite

Complete and verify:

```text
docs/post-launch-measurement-plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- Payment-test and SEO outputs.
- Experiments.
- Event recording.
- Metrics aggregation.
- Threshold evaluation.
- Measurement reports.
- Experiment decisions.

## Non-Goals

Do not add these in this phase:

- New evidence collectors.
- Real payment processing.
- Public hosting.
- Multi-user collaboration.
- Portfolio-level ranking across many ideas.
- Automated product building.

This phase is about decision discipline for a single idea or experiment chain.

## Target Structure

Create:

```text
src/decision-loop/
  decision-engine.ts
  learning-history.ts
  next-experiment.ts
  pivot-generator.ts
  types.ts

src/commands/
  decide.ts

prompts/
  pivot-options.md
  next-experiment.md
  decision-memo.md
```

Optional web additions:

```text
src/web/routes/decisions.ts
src/web/views/decision-loop.ts
```

## Implementation Steps

### Step 1: Add Decision History

Add persistent decision records if not already covered by `experiment_decisions`.

Recommended table:

```text
idea_decisions
```

Fields:

```text
id
idea_id
experiment_id
decision
reason
evidence_json
next_action
created_at
```

Decision values:

```text
build_mvp
persevere
pivot
validate_deeper
kill
inconclusive
```

### Step 2: Build Decision Engine

Input:

- Idea.
- Latest validation report.
- Latest payment/SEO spec.
- Latest measurement report.
- Experiment thresholds.
- Prior decisions.

Output:

- Decision.
- Reason.
- Evidence basis.
- Confidence.
- Missing proof.
- Recommended next action.

The engine should be deterministic first. AI can draft a narrative memo later.

### Step 3: Add Learning History

Generate a timeline:

```text
Idea created
  -> autocomplete evidence
  -> external evidence
  -> payment-test spec
  -> experiment launched
  -> events recorded
  -> measurement report
  -> decision
```

This helps prevent repeated tests and vague memory.

### Step 4: Add Pivot Generator

When decision is `pivot`, generate up to three specific pivots.

Pivot types:

```text
narrower_customer
narrower_use_case
different_platform
different_payment_moment
different_distribution_channel
lower_trust_workflow
simpler_result
```

Each pivot should include:

- Exact customer.
- Exact pain.
- Why original evidence points there.
- What evidence is still missing.
- Next experiment.

### Step 5: Add Next Experiment Generator

For every decision, generate one next action.

Examples:

```text
build_mvp -> Build paid-preview MVP for top task page.
persevere -> Continue traffic test until minimum sample size.
pivot -> Test narrower use case with new landing page.
validate_deeper -> Collect Reddit and competitor review evidence.
kill -> Archive idea and record kill reason.
inconclusive -> Run another measurement window or fix tracking.
```

The next action should be singular and concrete.

### Step 6: Add CLI Command

Add:

```bash
npm run decide -- --idea-id <id>
```

Optional:

```bash
npm run decide -- --experiment-id <id>
```

Expected output:

```text
Decision: pivot
Reason: Payment clicks were below threshold, but problem-intent queries and complaints point to a narrower business use case.
Next action: Generate a landing page test for <specific pivot>.
```

### Step 7: Add Decision Memo Report

Store a Markdown/JSON decision memo in `reports`.

Required sections:

- Current idea.
- Evidence summary.
- Measurement summary.
- Decision.
- Reason.
- Prior decisions.
- Pivot options if applicable.
- Single next action.
- What would change the decision.

## Data / API / CLI Contracts

### Decision Engine Input

```json
{
  "ideaId": 123,
  "experimentId": 456,
  "latestReport": {},
  "measurementSnapshot": {},
  "thresholdResults": [],
  "priorDecisions": []
}
```

### Decision Engine Output

```json
{
  "decision": "pivot",
  "confidence": "medium",
  "reason": "CTA clicks were weak, but evidence suggests a narrower business workflow.",
  "evidence": [],
  "missingProof": [],
  "nextAction": "Test a narrower landing page for business users.",
  "pivotOptions": []
}
```

### CLI

```bash
npm run decide -- --idea-id 123
```

Output should include:

- Decision.
- Confidence.
- Report ID/path.
- Next action.

## Testing Plan

Add tests for:

- `build_mvp` decision from strong measurement.
- `pivot` decision from mixed evidence.
- `kill` decision from clear kill thresholds.
- `inconclusive` decision from low sample size.
- Learning history generation.
- Pivot option generation with fixture data.
- Decision memo persistence.
- CLI command with temp SQLite DB.

Default tests must not call:

- Live Codex.
- External APIs.
- Payment providers.

Use fixture evidence and measurement snapshots.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

Optional manual smoke test:

```bash
npm run decide -- --idea-id <existing-id>
```

## Acceptance Criteria

- Decision engine exists.
- Learning history can be generated for an idea.
- Decision memo can be stored as a report.
- CLI command can evaluate an idea or experiment.
- Pivot options are generated only when evidence supports a pivot.
- Kill decisions preserve the reason.
- Inconclusive data does not produce false confidence.
- Next action is singular and concrete.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Decision logic may become too subjective.
- AI-generated pivots may drift away from evidence.
- Low sample sizes can be overinterpreted.
- Users may resist kill decisions.
- Repeated reports can become noisy.

Mitigations:

- Keep deterministic rules first.
- Require evidence references.
- Mark low sample sizes as inconclusive.
- Store prior decisions.
- Generate one next action, not a generic list.

## Recommended Next Phase

After the pivot/persevere loop works, add portfolio-level idea comparison:

```text
docs/idea-portfolio-plan.md
```

That phase should compare multiple ideas by evidence strength, risk, cost to test, and best next action.
