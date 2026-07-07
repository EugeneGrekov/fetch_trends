# Payment Test and SEO Implementation

## What Was Implemented

This phase adds deterministic, offline generators for post-report validation artifacts:

- `payment_test_spec` reports for fake-door, preorder, concierge, paid-preview, or `not_justified` decisions.
- `seo_plan` reports for focused SEO page clusters and page build order.
- Markdown and JSON artifact files under `artifacts/ideas/<idea-id>/`.
- CLI scripts for generating each artifact from existing SQLite evidence.

The implementation reads only stored local data: ideas, validation reports, scores, queries, autocomplete predictions, sources, evidence, and competitors.

## Commands

```bash
npm run payment-test -- --idea-id <id>
npm run seo-plan -- --idea-id <id>
```

Optional flags:

```bash
--db <path>
--outDir <path>
```

Default artifact paths:

```text
artifacts/ideas/<idea-id>/payment-test.md
artifacts/ideas/<idea-id>/payment-test.json
artifacts/ideas/<idea-id>/seo-plan.md
artifacts/ideas/<idea-id>/seo-plan.json
```

## Persistence

Generated outputs are stored in the existing `reports` table:

```text
report_type = payment_test_spec
report_type = seo_plan
```

The generators require an existing `search-language-validation` report for the idea. They do not rerun validation or call external services.

## Safety Rules

- Weak ideas produce `not_justified` instead of landing page copy.
- Payment-test outputs include the required warning that payment intent is not proof of validation.
- Analytics event plans and experiment thresholds are included as assumptions, not benchmarks.
- SEO plans are tied to stored query/evidence records and explicitly reject generic blog calendars.

## Verification

Default tests use fixtures and temp SQLite databases only. They do not call live Google, Codex, external APIs, payment providers, or Search Console.
