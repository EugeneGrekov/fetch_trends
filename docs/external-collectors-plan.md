# External Collectors Plan

## Goal

After project-local Codex skills are implemented, add external evidence collectors that enrich validation reports beyond autocomplete-only evidence.

This phase should collect and store real external evidence from search results, communities, videos, competitor pages, and review surfaces where feasible.

Core rule:

```text
Collectors gather source material.
SQLite stores raw sources and extracted evidence.
AI may summarize evidence, but source records remain the proof.
```

## Prerequisite

Complete and verify:

```text
docs/codex-skills-plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- Autocomplete utility boundary.
- SQLite persistence.
- Minimal validation command.
- AI runner.
- Project-local Codex skills.
- Stored reports and scores.

## Non-Goals

Do not add these in this phase:

- Web UI.
- Payment-test landing page generation.
- Search Console integration.
- Full browser automation for every website.
- Aggressive scraping or anti-bot bypassing.
- Automated purchase/payment validation.

This phase focuses on evidence collection and storage.

## Target Structure

Create collector utility modules:

```text
src/utilities/
  serp/
    collector.ts
    types.ts
  reddit/
    collector.ts
    types.ts
  youtube/
    collector.ts
    types.ts
  competitors/
    collector.ts
    types.ts
  reviews/
    collector.ts
    types.ts
```

Create validation integration modules:

```text
src/validation/
  external-evidence.ts
  source-normalizer.ts
  complaint-extractor.ts
  competitor-analyzer.ts
```

Add prompt templates if AI extraction is used:

```text
prompts/
  source-evidence-extract.md
  competitor-evidence-extract.md
  review-complaint-extract.md
```

## Collector Interface

Use a shared collector shape:

```ts
export interface EvidenceCollector<Input, Output> {
  readonly name: string;
  collect(input: Input): Promise<Output>;
}
```

Each collector output should include:

```ts
interface CollectorOutput<TItem> {
  items: TItem[];
  rawMetadata: Record<string, unknown>;
  errors: CollectorError[];
  blocked: boolean;
  fetchedAt: string;
}
```

Collector errors should be stored, not swallowed.

## SQLite Additions

The SQLite foundation should already include `sources`, `evidence`, and `competitors`. If not, add them now.

### `sources`

Stores external pages, threads, videos, or listings.

Required fields:

```text
id
idea_id
url
source_type
title
snippet
fetched_at
```

Recommended `source_type` values:

```text
serp_result
reddit_thread
youtube_video
youtube_comment
competitor_page
review_page
forum_thread
app_store_listing
chrome_web_store_listing
```

### `evidence`

Stores extracted pain, workaround, complaint, and payment signals.

Required fields:

```text
id
idea_id
source_id
quote
pain_type
trigger
workaround
complaint
urgency
payment_signal
confidence_score
created_at
```

### `competitors`

Stores product and alternative-solution evidence.

Required fields:

```text
id
idea_id
name
url
product_type
price_text
pricing_model
strengths_json
weaknesses_json
review_summary
created_at
```

## Collector 1: SERP Provider

Purpose:

- Find search result patterns.
- Identify competitor pages.
- Find Reddit/forum/YouTube result URLs.
- Detect whether the SERP is dominated by strong tools, weak content, or generic guides.

Recommended provider strategy:

- Use a provider adapter interface.
- Do not hard-code one provider into validation logic.
- Start with one provider only.

Candidate providers:

```text
SerpApi
DataForSEO
Zenserp
Bright Data
```

Input:

```json
{
  "queries": ["export chrome bookmarks to zip"],
  "country": "US",
  "language": "en",
  "limit": 10
}
```

Output items:

```json
{
  "query": "export chrome bookmarks to zip",
  "url": "https://example.com",
  "title": "Export Chrome bookmarks...",
  "snippet": "...",
  "position": 1,
  "resultType": "organic"
}
```

Persistence:

- Insert results into `sources`.
- Link source to query if query-source join table exists later.
- Store raw provider metadata in `tool_runs`.

## Collector 2: Reddit / Forum Discovery

Purpose:

- Find real user complaints.
- Find current workarounds.
- Identify unresolved frustration.

Input:

```json
{
  "queries": ["forgot where I parked reddit"],
  "subreddits": [],
  "limit": 25
}
```

Output items:

```json
{
  "url": "https://reddit.com/...",
  "title": "...",
  "snippet": "...",
  "community": "r/...",
  "score": 12,
  "commentCount": 8,
  "createdAt": "..."
}
```

Persistence:

- Store threads as `sources`.
- Extract quotes into `evidence`.

Guardrails:

- Respect API limits and terms.
- Do not scrape aggressively.
- Do not treat upvotes as willingness to pay.

## Collector 3: YouTube Search

Purpose:

- Find tutorials and workaround videos.
- Detect common “how to” demand.
- Later mine comments for pain signals.

Input:

```json
{
  "queries": ["how to export chrome bookmarks"],
  "country": "US",
  "limit": 10
}
```

Output items:

```json
{
  "url": "https://youtube.com/watch?v=...",
  "title": "...",
  "description": "...",
  "channelTitle": "...",
  "publishedAt": "...",
  "viewCount": null
}
```

Persistence:

- Store videos as `sources`.
- Store comments as `sources` or `evidence` if comment collection is implemented.

Guardrails:

- Do not infer payment intent from video views alone.
- Prefer comments and tutorial gaps as pain evidence.

## Collector 4: Competitor Pages

Purpose:

- Identify direct competitors.
- Extract pricing.
- Extract positioning.
- Identify free/built-in alternatives.
- Find weaknesses and support gaps.

Input:

```json
{
  "candidateUrls": ["https://example.com/tool"],
  "idea": {}
}
```

Output items:

```json
{
  "name": "Example Tool",
  "url": "https://example.com/tool",
  "productType": "direct_competitor",
  "priceText": "$29 one-time",
  "pricingModel": "one-time",
  "positioning": "Export X to Y",
  "strengths": [],
  "weaknesses": []
}
```

Persistence:

- Store competitor page as `sources`.
- Store normalized competitor in `competitors`.

Guardrails:

- Mark missing price as `unknown`, not free.
- Do not invent weaknesses without evidence.

## Collector 5: Review Mining

Purpose:

- Extract complaints about existing tools.
- Find support burden signals.
- Find payment and refund signals.

Sources can include:

- App Store.
- Google Play.
- Chrome Web Store.
- Product Hunt.
- G2/Capterra/Trustpilot where relevant.

Start narrow. Do not attempt every review platform in the first implementation.

Output evidence fields:

```json
{
  "quote": "The app loses my parked location unless I open it first.",
  "complaint": "reliability",
  "workaround": "manual open",
  "paymentSignal": "weak",
  "confidenceScore": 72
}
```

## Evidence Extraction

Use deterministic extraction where obvious. Use AI only for bounded text analysis.

AI extraction inputs should include:

- Source title.
- Source URL.
- Snippet or page text excerpt.
- Idea hypothesis.
- Extraction schema.

AI extraction outputs must include:

- Exact quote.
- Fielded interpretation.
- Confidence score.
- Reason.

Reject AI evidence if it has no exact quote.

## Validation Command Integration

Enhance `validate` with external evidence flags:

```bash
npm run validate -- --idea "<idea>" --external true
```

Optional scoped flags:

```bash
--serp true|false
--reddit true|false
--youtube true|false
--competitors true|false
--reviews true|false
```

Default recommendation:

```text
external=false
```

until provider configuration exists. The command should explain which collectors are unavailable due to missing API keys.

## Configuration

Add collector config:

```text
config/collectors.json
```

Environment variables:

```text
SERP_API_KEY
DATAFORSEO_LOGIN
DATAFORSEO_PASSWORD
YOUTUBE_API_KEY
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
```

The app should still run without these keys in autocomplete-only mode.

## Report Updates

Reports should add:

- External source summary.
- Pain evidence table.
- Current workaround evidence.
- Competitor table.
- Free/built-in alternative analysis.
- Payment proxy evidence.
- Strongest source links.
- Evidence gaps by collector.

Reports must still clearly label:

```text
Facts
Inferences
Assumptions
Missing proof
```

## Testing Plan

Add tests for:

- Collector interfaces with fake provider responses.
- SERP normalization.
- Reddit/forum result normalization.
- YouTube result normalization.
- Competitor extraction from fixture HTML/text.
- Evidence extraction from fixture snippets.
- DB insertion for sources, evidence, and competitors.
- Validation command with fake collectors.
- Missing API key behavior.

Default tests must not call live external APIs.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

Optional manual smoke tests require explicit API keys and should not be part of default CI/local verification.

## Acceptance Criteria

- At least one SERP provider adapter exists.
- At least one community/forum collector exists or is stubbed behind a fake/test adapter.
- External sources can be stored in SQLite.
- Evidence quotes can be extracted and stored.
- Competitors can be stored.
- `validate --external true` can run when configured.
- Missing API keys produce clear non-fatal warnings.
- Reports include external evidence when available.
- Reports remain honest when external evidence is absent.
- Default tests do not hit live external APIs.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- API costs can grow quickly.
- External provider terms may limit collection.
- Scraped pages can be unreliable.
- AI may over-interpret weak snippets.
- Review platforms may block or change markup.
- External evidence can create false confidence if source quality is low.

Mitigations:

- Start with one provider.
- Store provider metadata and errors.
- Use strict rate limits.
- Keep missing evidence explicit.
- Require exact quotes for complaint evidence.
- Do not infer payment intent from popularity alone.

## Recommended Next Phase

After external collectors are working, build the local web interface:

```text
docs/web-interface-plan.md
```

The web UI should let users submit ideas, watch validation jobs, inspect evidence, view scores, and export reports from the SQLite-backed pipeline.
