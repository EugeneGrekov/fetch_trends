# Global Plan: Evidence-First Micro-Business Validator

## Purpose

Build a local validation system for one-time-payment micro-business ideas.

The system should not act as an oracle that says an idea is good or bad. It should collect evidence, preserve sources, score the idea against strict rules, explain why the score was produced, and recommend the next validation action.

Core principle:

```text
AI can generate hypotheses.
Tools collect evidence.
SQLite stores proof.
Scoring exposes risk.
Only payment validates the business.
```

## Current Baseline

The repository already includes a working Google Autocomplete research CLI.

Current capability:

- Expands seed phrases into Google Autocomplete prefixes.
- Collects autocomplete predictions through Playwright.
- Deduplicates normalized queries.
- Classifies broad intent.
- Scores query confidence.
- Exports CSV, JSON, summary files, and resume state.

Current limitation:

- It validates search language only.
- It does not yet validate current behavior, competitor gaps, willingness to pay, technical risk, support risk, or final micro-business viability.

## Target System

The target system is a local evidence pipeline with four interfaces:

| Interface | Purpose |
|---|---|
| CLI | Run validation jobs locally and script them. |
| Codex skills | Let Codex invoke validation tools naturally from prompts. |
| Web UI | Let a user submit ideas and inspect results. |
| SQLite database | Persist all ideas, jobs, evidence, scores, reports, and artifacts. |

High-level architecture:

```text
User idea
  -> Validation orchestrator
  -> Local tools and collectors
  -> SQLite evidence store
  -> Codex AI analysis
  -> Evidence-backed report
  -> Next validation action
```

## Product Thesis

A valid micro-business idea should have:

- A specific painful task.
- Clear user and trigger.
- Existing search behavior.
- Existing workaround.
- Workaround annoyance.
- A simple paid result.
- One-time payment logic.
- Manageable trust and support burden.
- Organic distribution path.
- A realistic payment test.

The tool should aggressively reject weak ideas.

Good output:

```text
This idea has enough evidence to justify a payment-intent test.
```

Bad output:

```text
This idea is validated.
```

## Validation Pipeline

Use this global sequence:

| Stage | Name | Output |
|---:|---|---|
| 1 | Idea normalization | Structured hypothesis object. |
| 2 | Query generation | 100 to 300 exact search queries by intent. |
| 3 | Autocomplete collection | Real autocomplete predictions and intent clusters. |
| 4 | SERP collection | Search result evidence, page types, competitor pages. |
| 5 | Trends and keyword data | Relative demand, geography, CPC or volume proxies where available. |
| 6 | Community evidence | Reddit, forums, YouTube, Hacker News, StackExchange, reviews. |
| 7 | Pain extraction | Quotes, complaints, triggers, workarounds, urgency. |
| 8 | Competitor analysis | Direct, indirect, free, paid, built-in, abandoned alternatives. |
| 9 | Payment proxy analysis | Paid competitors, CPC, business use, urgency, previewability. |
| 10 | Technical risk review | API, platform, permissions, privacy, reliability, support. |
| 11 | SEO opportunity | Keyword clusters, page plan, SERP weakness, content gaps. |
| 12 | MVP scope | Smallest paid workflow and explicit non-goals. |
| 13 | Scoring | 30-point guide score and 100-point pipeline score. |
| 14 | Decision | Build payment test, validate deeper, cheap MVP only, or kill. |
| 15 | Report | Markdown, JSON, and UI-ready report with citations. |

## Evidence Model

The system must store evidence before interpretation.

Do not let the AI produce unsupported summaries. Every factual claim in the final report should trace back to a stored source, quote, prediction, competitor page, or tool output.

Evidence types:

| Type | Examples |
|---|---|
| Query evidence | Generated queries, autocomplete predictions, related searches. |
| Source evidence | SERP results, Reddit threads, YouTube videos, review pages. |
| Pain evidence | Exact user complaints and workaround descriptions. |
| Competitor evidence | Product names, prices, positioning, reviews, weaknesses. |
| Payment evidence | Paid tools, ads, CPC, premium plans, business pain. |
| Technical evidence | API constraints, permission requirements, platform limitations. |
| SEO evidence | SERP type, ranking competitors, page gaps, keyword clusters. |

## SQLite Plan

Use SQLite as the system of record.

Minimum schema:

```sql
ideas
- id
- title
- raw_description
- normalized_json
- target_market
- platform
- expected_price
- business_model
- status
- created_at
- updated_at

jobs
- id
- idea_id
- job_type
- status
- started_at
- completed_at
- error_message

tool_runs
- id
- job_id
- tool_name
- input_json
- output_json
- status
- started_at
- completed_at
- error_message

queries
- id
- idea_id
- query
- intent_type
- source
- priority_score
- created_at

autocomplete_predictions
- id
- idea_id
- query_id
- prediction
- normalized_prediction
- intent
- confidence_score
- source_prefix
- country
- language
- created_at

sources
- id
- idea_id
- url
- source_type
- title
- snippet
- fetched_at

evidence
- id
- idea_id
- source_id
- quote
- pain_type
- trigger
- workaround
- complaint
- urgency
- payment_signal
- confidence_score
- created_at

competitors
- id
- idea_id
- name
- url
- product_type
- price_text
- pricing_model
- strengths_json
- weaknesses_json
- review_summary
- created_at

scores
- id
- idea_id
- score_type
- score_json
- total_score
- decision
- created_at

reports
- id
- idea_id
- job_id
- report_type
- markdown
- json
- created_at
```

Later additions:

- `artifacts` for generated files.
- `events` for web UI tracking and fake-door tests.
- `landing_pages` for generated validation pages.
- `search_console_metrics` for post-launch measurement.

## CLI Plan

Keep existing autocomplete behavior and add higher-level commands.

Proposed commands:

```bash
npm run autocomplete -- --seed "export chrome bookmarks to zip" --out ./results/chrome.csv
```

```bash
npm run validate -- --idea "automatic app that saves parking location when Bluetooth disconnects" --country US
```

```bash
npm run report -- --idea-id 123 --format markdown
```

```bash
npm run db -- --migrate
```

Command responsibilities:

| Command | Responsibility |
|---|---|
| `autocomplete` | Existing query-language collection. |
| `validate` | Full or partial validation pipeline. |
| `report` | Regenerate reports from stored evidence. |
| `db` | Migrations, inspection, and local maintenance. |
| `web` | Start local web interface. |
| `worker` | Run queued validation jobs. |

## Codex Skills Plan

Codex skills should wrap stable local tools. They should not become the core execution engine.

Skill candidates:

```text
.codex/skills/micro-business-autocomplete/SKILL.md
.codex/skills/micro-business-validate/SKILL.md
.codex/skills/micro-business-report/SKILL.md
```

Skill responsibilities:

| Skill | Responsibility |
|---|---|
| `micro-business-autocomplete` | Run and interpret autocomplete research. |
| `micro-business-validate` | Run a validation job for a supplied idea. |
| `micro-business-report` | Read stored evidence and produce a concise discussion summary. |

The skills should instruct Codex to call CLI commands, inspect outputs, and explain evidence. They should not ask Codex to invent evidence.

## AI Runner Plan

Use the useful pattern from `../BuildPrompts/scripts`, but simplify it.

Reusable ideas:

- Prompt templates on disk.
- Isolated temporary directories.
- Read-only Codex execution for analysis.
- Output files plus metadata.
- Route configuration for model and fallback choices.
- Run reports with model, tokens, duration, and errors.

Recommended local structure:

```text
prompts/
  idea-normalize.md
  query-generate.md
  evidence-extract.md
  competitor-analyze.md
  score-idea.md
  final-report.md

src/ai/
  runner.ts
  prompts.ts
  codex-runner.ts
  json-parse.ts
```

Codex should usually analyze prepared local evidence JSON, not browse directly and not mutate files.

Safe Codex execution pattern:

```bash
codex exec \
  --skip-git-repo-check \
  --ephemeral \
  -s read-only \
  -C "$ISOLATION_DIR" \
  -c default_tools_enabled=false \
  -o "$OUTPUT_PATH" \
  -
```

## Web Interface Plan

The web UI should be a local dashboard over the same SQLite-backed pipeline.

Core flow:

```text
User submits idea
  -> backend creates idea row
  -> backend creates validation job
  -> worker runs pipeline
  -> UI polls job status
  -> UI renders evidence, scores, report, and next action
```

Screens:

| Screen | Purpose |
|---|---|
| Idea input | Submit idea, target market, platform, price hypothesis. |
| Job status | Show current stage and errors. |
| Evidence dashboard | Show top queries, complaints, sources, competitors, red flags. |
| Query explorer | Inspect generated queries and autocomplete predictions. |
| Competitor explorer | Compare paid, free, built-in, and indirect alternatives. |
| Scorecard | Show category scores, kill rules, and decision. |
| Report | Read and export final evidence-backed report. |
| Next experiment | Show one recommended validation action. |

Web stack can stay lightweight:

- Node.js backend.
- SQLite.
- Server-rendered pages or a small frontend.
- Background worker process.

Avoid introducing a large framework until the pipeline is stable.

## Scoring Plan

Keep two scoring systems:

| Score | Purpose |
|---|---|
| 30-point guide score | Align with `micro_business_validation_guide.md`. |
| 100-point pipeline score | Support richer automated ranking and dashboard UI. |

30-point categories:

- Specific pain.
- Urgency.
- Existing workaround.
- Workaround annoyance.
- Search intent.
- One-time value.
- Simple result.
- Trust manageable.
- Low support.
- Price logic.

100-point categories:

| Category | Weight |
|---|---:|
| Pain clarity | 10 |
| Urgency | 10 |
| Existing annoying workaround | 10 |
| Search demand | 15 |
| High-intent keywords | 10 |
| Competitor weakness | 10 |
| Payment proxy | 15 |
| Technical simplicity | 10 |
| Trust/privacy simplicity | 5 |
| Support simplicity | 5 |

Decision thresholds:

| Score | Decision |
|---:|---|
| 80 to 100 | Build payment test. |
| 65 to 79 | Validate deeper. |
| 50 to 64 | Only build if MVP is very cheap. |
| Below 50 | Kill. |

Hard kill rules override scores.

Examples:

- No high-intent search queries found.
- Existing free solution is already simple and trusted.
- User must grant scary permissions before seeing value.
- Cannot show value before payment.
- Support burden is likely high.
- Platform APIs are unstable or hostile.
- Traffic is curiosity-only, not problem-solving intent.
- Searchers clearly want free-only solutions.

## Report Plan

Reports should be generated from stored evidence and include citations.

Required report sections:

- Verdict.
- Exact pain.
- Current behavior.
- Existing solution trap.
- Search demand.
- Competitors and alternatives.
- Payment proxy.
- Technical risk.
- SEO opportunity.
- MVP scope.
- Scores.
- Kill rules triggered.
- Evidence table.
- Assumptions.
- Most important missing proof.
- Single next validation action.

The final report should separate:

| Section | Meaning |
|---|---|
| Facts | Stored evidence with sources. |
| Inferences | AI or scoring conclusions based on evidence. |
| Assumptions | Claims not yet proven. |
| Missing proof | What must be tested next. |

## Roadmap

### Phase 1: Persistence Foundation

Goal: turn current autocomplete output into durable SQLite evidence.

Work:

- Add SQLite dependency and migration system.
- Add database module.
- Add tables for ideas, jobs, tool runs, queries, autocomplete predictions, scores, and reports.
- Refactor autocomplete runner so it can write to SQLite.
- Keep current CSV/JSON exports working.

Exit criteria:

- A validation idea can be created locally.
- Autocomplete predictions are stored in SQLite.
- Existing tests pass.
- CLI still exports CSV/JSON.

### Phase 2: Validation CLI

Goal: create the first end-to-end local validator command.

Work:

- Add `validate` command.
- Add idea normalization.
- Add query generation.
- Reuse autocomplete collector.
- Add initial 30-point and 100-point score stubs.
- Generate a Markdown report from stored evidence.

Exit criteria:

- One command takes an idea and produces a stored job, stored evidence, scores, and report.
- Report clearly says what is evidence versus assumption.

### Phase 3: Codex AI Runner

Goal: use Codex for structured analysis without making Codex the source of truth.

Work:

- Add prompt templates.
- Add AI runner around `codex exec`.
- Add JSON output validation.
- Add metadata capture.
- Add retry and failure handling.
- Store AI outputs in `tool_runs`.

Exit criteria:

- Codex can normalize an idea, generate query groups, extract evidence, and draft a report from local JSON inputs.
- Failed AI calls do not corrupt stored evidence.

### Phase 4: Codex Skills

Goal: make the tools callable naturally from Codex.

Work:

- Add autocomplete skill.
- Add validator skill.
- Add report skill.
- Document usage examples.
- Ensure skills call local CLI commands and read SQLite/report output.

Exit criteria:

- A Codex conversation can run validation using the skill.
- Skill output references stored evidence and files.

### Phase 5: External Evidence Collectors

Goal: move beyond autocomplete into stronger proof.

Work:

- Add SERP provider integration.
- Add Reddit collector.
- Add YouTube search collector.
- Add competitor page collector.
- Add review mining where platform APIs or public pages allow it.
- Add source and quote storage.

Exit criteria:

- Reports include real external sources and user complaints.
- Competitor and workaround sections are evidence-backed.

### Phase 6: Web Interface

Goal: provide a local UI for submitting ideas and inspecting results.

Work:

- Add backend server.
- Add idea submission form.
- Add job queue and worker.
- Add dashboard pages.
- Add report export.

Exit criteria:

- User can submit an idea in the browser.
- User can watch progress.
- User can inspect evidence and final score.

### Phase 7: Payment Test and SEO Outputs

Goal: generate the next validation experiment after automated validation.

Work:

- Add landing page draft generation.
- Add fake-door analytics event plan.
- Add SEO page cluster generator.
- Add Search Console import for launched pages.

Exit criteria:

- Report ends with a concrete payment-intent test or kill decision.
- SEO plan is generated only when evidence supports it.

## Engineering Rules

- Keep tools deterministic where possible.
- Store raw evidence before AI interpretation.
- Never invent search volume or demand.
- Treat autocomplete as search-language evidence, not volume.
- Cite sources in reports.
- Make every score explainable.
- Prefer local-first operation.
- Keep CLI and web UI on the same pipeline.
- Preserve existing autocomplete behavior while extending it.
- Do not depend on a single external API provider.
- Fail safely when blocked, rate-limited, or CAPTCHA appears.

## Open Decisions

Questions to resolve before implementation:

| Decision | Options |
|---|---|
| SQLite library | `better-sqlite3`, `sqlite`, or ORM. |
| Migration tool | Simple local migration runner or Drizzle/Kysely. |
| Web framework | Minimal Express/Fastify, Vite app, or Next.js. |
| Job model | In-process worker first, external queue later. |
| SERP provider | SerpApi, DataForSEO, Bright Data, Zenserp, or pluggable adapters. |
| AI provider path | Codex CLI only first, or reusable provider abstraction. |
| Skill packaging | Project-local skills first, global install later. |

Recommended defaults:

- SQLite with a minimal migration runner.
- In-process local worker first.
- Pluggable collector adapters.
- Codex CLI runner first.
- Project-local Codex skills first.

## First Implementation Slice

The first slice should be small and useful:

```text
Input idea
  -> create SQLite idea and job
  -> generate query hypotheses
  -> run existing autocomplete collector
  -> store predictions
  -> calculate initial search-language score
  -> generate Markdown report
```

This preserves the existing strength of the repo while creating the foundation for the full validation system.
