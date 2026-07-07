# Payment Test and SEO Plan

## Goal

After the local web interface is implemented, add evidence-backed outputs that help the user run the next real validation step: a payment-intent test and focused SEO plan.

This phase should generate practical validation assets from stored evidence:

- Landing page draft.
- Fake-door or preorder test spec.
- Analytics event plan.
- SEO page cluster.
- Keyword-to-page mapping.
- Experiment decision thresholds.

Core rule:

```text
Automated validation can justify a test.
Only payment behavior validates willingness to pay.
SEO plans must come from evidence-backed query intent.
```

## Prerequisite

Complete and verify:

```text
docs/web-interface-plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- Local web UI.
- SQLite-backed ideas, jobs, sources, evidence, competitors, scores, and reports.
- External evidence collectors.
- AI runner.
- Stored validation reports.
- Evidence dashboard and report export.

## Non-Goals

Do not add these in this phase:

- Real payment processing.
- Public hosting/deployment automation.
- Search Console integration.
- Google Ads campaign management.
- Email automation.
- Multi-user funnel analytics.
- Full website CMS.

This phase generates specs and drafts. It does not launch or host the payment test.

## Target Structure

Create:

```text
src/validation/
  payment-test-generator.ts
  seo-plan-generator.ts
  experiment-thresholds.ts

src/commands/
  payment-test.ts
  seo-plan.ts

prompts/
  landing-page-draft.md
  payment-test-spec.md
  seo-page-plan.md
```

Optional web routes:

```text
src/web/routes/experiments.ts
src/web/views/payment-test.ts
src/web/views/seo-plan.ts
```

Optional SQLite tables:

```text
experiments
seo_pages
```

## Implementation Steps

### Step 1: Add Experiment Output Types

Define typed outputs for:

- Payment test spec.
- Landing page draft.
- Analytics event plan.
- SEO page plan.
- Experiment thresholds.

Example:

```ts
export interface PaymentTestSpec {
  ideaId: number;
  reportId: number;
  verdict: string;
  testType: 'fake-door' | 'preorder' | 'concierge' | 'paid-preview';
  headline: string;
  offer: string;
  priceHypothesis: string;
  cta: string;
  trustClaims: string[];
  requiredEvidence: string[];
  analyticsEvents: AnalyticsEventSpec[];
  decisionThresholds: ExperimentThreshold[];
}
```

### Step 2: Add Payment Test Generator

Generate a payment test only when the validation report supports it.

Inputs:

- Idea.
- Latest validation report.
- Scores.
- Evidence quotes.
- Competitor/pricing evidence.
- Missing proof.

Output:

- Recommended test type.
- Landing page copy.
- Price hypothesis.
- CTA variants.
- Trust section.
- FAQ.
- Analytics events.
- Kill/persevere thresholds.

The generator must say when a payment test is not justified.

### Step 3: Add SEO Plan Generator

Generate a focused SEO plan from stored query and SERP evidence.

Inputs:

- High-intent queries.
- How-to queries.
- Problem-intent queries.
- Comparison queries.
- SERP evidence.
- Competitor pages.
- Validation score.

Output:

- Money page plan.
- How-to page plan.
- Comparison page plan.
- FAQ/trust page plan.
- Keyword-to-page map.
- Internal linking plan.
- Prioritized build order.

The SEO plan must not recommend generic blog content.

### Step 4: Add CLI Commands

Add:

```bash
npm run payment-test -- --idea-id <id>
```

Add:

```bash
npm run seo-plan -- --idea-id <id>
```

Optional combined command:

```bash
npm run experiment -- --idea-id <id>
```

Commands should read from SQLite and write Markdown/JSON artifacts.

### Step 5: Add Web UI Links

If the web UI exists, add links from:

- Idea dashboard.
- Report page.

To:

- Payment test draft.
- SEO plan.

Do not make these outputs look like launched experiments. Label them as drafts/specs.

### Step 6: Store Outputs

Option A: store generated output in existing `reports` table:

```text
report_type = payment_test_spec
report_type = seo_plan
```

Option B: add dedicated tables:

```text
experiments
seo_pages
```

Recommended first implementation:

- Store Markdown/JSON in `reports`.
- Add dedicated tables later if experiment tracking is implemented.

## Data / API / CLI Contracts

### Payment Test CLI

Command:

```bash
npm run payment-test -- --idea-id 123
```

Output:

```text
Generated payment test spec:
Report ID: 456
Markdown: artifacts/ideas/123/payment-test.md
JSON: artifacts/ideas/123/payment-test.json
```

### SEO Plan CLI

Command:

```bash
npm run seo-plan -- --idea-id 123
```

Output:

```text
Generated SEO plan:
Report ID: 457
Markdown: artifacts/ideas/123/seo-plan.md
JSON: artifacts/ideas/123/seo-plan.json
```

### Payment Test Decision Values

Use:

```text
not_justified
fake_door
preorder
concierge
paid_preview
```

### SEO Decision Values

Use:

```text
build_now
build_after_more_evidence
do_not_build_seo_too_weak
```

## Payment Test Spec Requirements

Every payment test spec must include:

- Exact target user.
- Exact painful task.
- Offer headline.
- One-time price hypothesis.
- CTA.
- Trust claims.
- Before/after explanation.
- 3-step workflow.
- FAQ.
- Analytics events.
- Decision thresholds.
- Risks.
- Required missing proof.

Required warning:

```text
This is a payment-intent test, not proof that the business is validated.
```

## Landing Page Draft Requirements

Landing page draft sections:

- H1 matching exact task language.
- Subheadline.
- Problem section.
- Before/after section.
- 3-step process.
- Preview-before-pay explanation if applicable.
- Trust/privacy section.
- Pricing block.
- FAQ.
- CTA variants.

Avoid:

- Generic startup copy.
- Broad productivity language.
- Subscription framing unless evidence supports recurring need.
- Unsupported claims.

## Analytics Event Plan

Generate event names:

```text
page_view
cta_click
preview_start
preview_complete
checkout_start
payment_click
email_submit
reply_received
refund_requested
support_contact
```

For fake-door tests where preview is unavailable:

```text
page_view
pricing_view
cta_click
payment_click
email_submit
```

Each event should define:

- Trigger.
- Payload fields.
- Why it matters.
- Strong signal.
- Weak signal.
- Kill signal.

## Experiment Thresholds

Generate thresholds tied to the evidence quality.

Example:

```text
Strong signal:
100 targeted visitors, 8+ CTA clicks, 3+ payment clicks, 1+ direct reply asking for access.

Kill signal:
300 targeted visitors, under 1% CTA click rate, no payment clicks.
```

Thresholds must avoid fake certainty.

The generator should say:

```text
Exact conversion benchmarks are assumptions until real traffic exists.
```

## SEO Plan Requirements

Every SEO plan must include:

- Keyword clusters.
- Page types.
- Target query.
- User intent.
- Proposed title.
- H1.
- CTA.
- Evidence source.
- Priority.
- Why this page should or should not be built.

Required page types:

- Money page.
- How-to guide.
- Comparison page.
- Problem/troubleshooting page.
- FAQ/trust page.

Do not recommend broad generic blog posts unless evidence shows demand.

## Report Updates

The final validation report should link to generated outputs when available:

- Payment test spec report ID/path.
- SEO plan report ID/path.

Do not regenerate these automatically on every report view unless explicitly requested.

## Testing Plan

Add tests for:

- Payment test generator with strong evidence.
- Payment test generator with weak evidence.
- SEO plan generator from query fixtures.
- CLI output paths.
- Report persistence.
- Web links if web routes are added.
- AI fallback when prompts fail.

Default tests must not call:

- Live Codex.
- Live external APIs.
- Payment providers.

Use fixture reports and fake evidence.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

Optional manual smoke test:

```bash
npm run payment-test -- --idea-id <existing-id>
npm run seo-plan -- --idea-id <existing-id>
```

## Acceptance Criteria

- Payment test generator exists.
- SEO plan generator exists.
- CLI command can generate a payment test spec from stored evidence.
- CLI command can generate an SEO plan from stored evidence.
- Outputs are stored as reports or artifacts.
- Weak ideas produce `not_justified` instead of fake landing page optimism.
- SEO plans are based on stored query/evidence data.
- Analytics event plan is included.
- Experiment thresholds are included.
- Default tests do not call live APIs, Codex, or payment providers.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Generated landing pages may sound too confident.
- SEO plans may drift into generic content marketing.
- Users may treat fake-door clicks as proof of payment intent.
- AI may invent conversion thresholds.
- Payment-test drafts may imply unavailable product functionality.

Mitigations:

- Require evidence references.
- Include explicit warnings.
- Use conservative wording.
- Mark thresholds as assumptions.
- Reject payment-test generation for weak ideas.

## Recommended Next Phase

After payment-test and SEO outputs exist, add post-launch measurement:

```text
docs/post-launch-measurement-plan.md
```

That phase should integrate real validation results such as Search Console data, analytics events, payment clicks, email submits, refunds, and support burden.
