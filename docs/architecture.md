# Architecture: Evidence-First Micro-Business Validator

## 1. System Intent

This project should become a local-first validation platform for one-time-payment micro-business ideas.

The system must collect evidence, preserve sources, score risks, and generate reports that explain why an idea should be killed, validated deeper, or moved to a payment-intent test.

It must not become an AI opinion generator.

Core operating rule:

```text
Tools collect evidence.
SQLite stores evidence.
AI interprets stored evidence.
Reports separate facts, inferences, assumptions, and missing proof.
```

## 2. Architecture Summary

Target shape:

```text
CLI / Web UI / Codex Skill
        |
        v
Validation Orchestrator
        |
        +-- Idea Normalizer
        +-- Query Generator
        +-- Tool Runner
        |     +-- Autocomplete Utility
        |     +-- SERP Collector
        |     +-- Reddit Collector
        |     +-- YouTube Collector
        |     +-- Competitor Collector
        |
        +-- Evidence Extractor
        +-- Scoring Engine
        +-- AI Runner
        +-- Report Generator
        |
        v
SQLite Evidence Store
        |
        v
Markdown / JSON / Web Dashboard
```

The architecture has three hard boundaries:

| Boundary | Rule |
|---|---|
| Utility boundary | Collectors and tools should be callable without the web UI or Codex. |
| Persistence boundary | Raw evidence is stored before AI interpretation. |
| AI boundary | AI receives bounded inputs and writes structured outputs with metadata. |

## 3. Repository Layout

Target layout:

```text
src/
  cli.ts
  commands/
    autocomplete.ts
    validate.ts
    report.ts
    db.ts
    web.ts
    worker.ts

  utilities/
    autocomplete/
      analysis.ts
      cli.ts
      collector.ts
      constants.ts
      exporter.ts
      expansion.ts
      input.ts
      normalize.ts
      runner.ts
      types.ts

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

  validation/
    orchestrator.ts
    idea-normalizer.ts
    query-generator.ts
    evidence-extractor.ts
    scoring.ts
    report-generator.ts
    types.ts

  db/
    connection.ts
    migrations.ts
    repositories/
      ideas.ts
      jobs.ts
      tool-runs.ts
      queries.ts
      evidence.ts
      scores.ts
      reports.ts
    schema.ts

  ai/
    runner.ts
    codex-runner.ts
    prompt-loader.ts
    json-output.ts
    types.ts

  web/
    server.ts
    routes/
    views/
    assets/

prompts/
  idea-normalize.md
  query-generate.md
  evidence-extract.md
  competitor-analyze.md
  score-idea.md
  final-report.md

docs/
  global-plan.md
  architecture.md

.codex/
  skills/
    micro-business-autocomplete/
      SKILL.md
    micro-business-validate/
      SKILL.md
    micro-business-report/
      SKILL.md
```

The first refactor should move the current autocomplete code into `src/utilities/autocomplete/`, then leave compatibility entrypoints in place.

## 4. Module Responsibilities

### 4.1 CLI

The CLI is the stable automation interface.

Commands:

| Command | Responsibility |
|---|---|
| `autocomplete` | Existing Google Autocomplete research utility. |
| `validate` | Full validation job from idea to report. |
| `report` | Read or export the latest stored report by idea ID or job ID. |
| `payment-test` | Generate a payment-intent test spec from stored validation evidence. |
| `seo-plan` | Generate an evidence-backed SEO page plan from stored queries and evidence. |
| `db` | Migration and database inspection tasks. |
| `web` | Start local web interface. |
| `worker` | Run queued validation jobs. |

Compatibility rule:

```bash
npm run autocomplete
```

must continue to work while the architecture evolves.

### 4.2 Utilities

Utilities are deterministic or API-backed tools.

They should:

- Accept explicit input objects.
- Return typed output objects.
- Avoid direct AI interpretation.
- Be usable from CLI, orchestrator, tests, and Codex skills.
- Store output only when called by a persistence-aware layer.

Example:

```text
Autocomplete utility
  input: seeds, country, language, depth, modifiers
  output: generated prefixes, predictions, summary, errors
```

### 4.3 Validation Orchestrator

The orchestrator coordinates a validation job.

Responsibilities:

- Create or load an idea.
- Create a job.
- Run each validation stage.
- Persist tool inputs and outputs.
- Apply stage-level failure handling.
- Generate final scores and report.
- Mark job status.

The orchestrator should not contain collector-specific logic. It should call utility adapters.

### 4.4 SQLite Layer

SQLite is the local source of truth.

Responsibilities:

- Store raw tool outputs.
- Store normalized evidence.
- Store AI outputs.
- Store reports and scores.
- Support job resume and inspection.

Rules:

- Do not only write final reports.
- Do not overwrite raw evidence when interpretations change.
- Store enough metadata to reproduce a report.
- Keep AI-generated conclusions separate from raw evidence.

### 4.5 AI Runner

The AI runner is responsible for bounded model calls.

Responsibilities:

- Load prompt templates.
- Prepare input payloads.
- Run Codex or another configured model.
- Capture output text.
- Parse JSON when required.
- Save metadata and failures.

It should not collect live evidence directly.

Default model execution should be read-only and isolated.

Example execution pattern:

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

### 4.6 Web UI

The web UI is a local dashboard over the same SQLite-backed pipeline.

Responsibilities:

- Submit ideas.
- Create validation jobs.
- Show job progress.
- Show collected evidence.
- Show scores and kill rules.
- Render final reports.
- Export artifacts.

The web UI must not implement a separate validation path.

### 4.7 Codex Skills

Codex skills are agent-facing wrappers around local tools.

They should:

- Explain when to use the tool.
- Run stable CLI commands.
- Read generated reports or SQLite-backed artifacts.
- Summarize evidence for the user.
- Stay above the CLI and orchestrator rather than becoming core validation logic.

They should not:

- Invent evidence.
- Replace the orchestrator.
- Be required by the web UI.
- Become the only way to run validation.

## 5. Data Flow

### 5.1 Autocomplete-Only Flow

```text
CLI command
  -> autocomplete utility
  -> generated prefixes
  -> Google Autocomplete collector
  -> predictions
  -> normalization/classification/scoring
  -> CSV/JSON export
  -> optional SQLite persistence
```

This is the current implemented capability plus optional persistence.

### 5.2 Full Validation Flow

```text
Raw idea
  -> ideas row
  -> validation job row
  -> AI idea normalization
  -> generated query set
  -> autocomplete utility
  -> external collectors
  -> source rows
  -> evidence extraction
  -> competitor analysis
  -> payment proxy analysis
  -> technical risk analysis
  -> scoring
  -> final report
```

### 5.3 Web Flow

```text
Browser form submit
  -> POST /ideas
  -> create idea
  -> create job
  -> redirect to job page
  -> worker runs job
  -> UI polls status
  -> UI renders stored evidence and report
```

### 5.4 Codex Skill Flow

```text
User asks Codex to validate idea
  -> skill instructions load
  -> Codex runs npm command
  -> command stores evidence and report
  -> Codex reads report
  -> Codex summarizes result and next action
```

## 6. Database Architecture

### 6.1 Tables

Initial tables:

| Table | Purpose |
|---|---|
| `ideas` | User-submitted ideas and normalized hypothesis data. |
| `jobs` | Validation job lifecycle. |
| `tool_runs` | Every utility or AI run with inputs, outputs, metadata, errors. |
| `queries` | Generated and discovered search queries. |
| `autocomplete_predictions` | Autocomplete prediction evidence. |
| `sources` | URLs or external evidence locations. |
| `evidence` | Extracted complaints, workarounds, pain, payment signals. |
| `competitors` | Competitor and alternative solution records. |
| `scores` | Scoring snapshots. |
| `reports` | Markdown and JSON reports. |

### 6.2 Logical Schema

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
- metadata_json
- status
- started_at
- completed_at
- error_message

queries
- id
- idea_id
- query
- normalized_query
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
- source_seed
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

### 6.3 Persistence Rules

- `tool_runs.input_json` stores exactly what was sent to a utility or model.
- `tool_runs.output_json` stores raw structured output where possible.
- `sources` are stored before extracted `evidence`.
- `reports` reference evidence indirectly through `idea_id` and `job_id`.
- Scores are snapshots. Re-scoring should create a new score row.
- Reports are snapshots. Re-reporting should create a new report row.
- Derived experiment artifacts use `report_type = payment_test_spec` and `report_type = seo_plan`.
- Derived artifacts may also be written to `artifacts/ideas/<idea-id>/` for Markdown/JSON export, but SQLite remains the local source of truth.

## 7. Validation Contracts

### 7.1 Idea Normalization Contract

Input:

```json
{
  "rawIdea": "automatic app that saves parking location when Bluetooth disconnects",
  "targetMarket": "US",
  "expectedPrice": "$19",
  "platform": "iPhone and Android"
}
```

Output:

```json
{
  "title": "Automatic parked car location saver",
  "user": "drivers who forget where they parked",
  "pain": "forgot where I parked",
  "trigger": "leaving the car",
  "current_workarounds": ["manual pin", "photo", "Apple Maps parked car", "AirTag"],
  "desired_result": "find the car without remembering to save the location",
  "business_model": "one-time payment",
  "price_range": "$5-$30",
  "category": "mobile utility",
  "assumptions": ["Bluetooth disconnect can be detected reliably", "users trust location permissions"]
}
```

### 7.2 Query Generation Contract

Output groups:

| Group | Examples |
|---|---|
| Pain | `forgot where I parked my car` |
| Solution | `app that remembers where I parked` |
| Automatic solution | `automatically save parking location app` |
| Workaround | `how to find my parked car without location` |
| Competitor | `best parked car locator app` |
| Payment proxy | `parking reminder app premium` |
| Community pain | `ADHD forgot where I parked` |

### 7.3 Evidence Extraction Contract

Every evidence row should preserve:

- Source URL.
- Exact quote or snippet.
- Pain type.
- Current workaround.
- Complaint.
- Urgency.
- Payment signal.
- Confidence score.

No quote means the item should be treated as weak evidence.

### 7.4 Scoring Contract

Scoring must output:

- Category scores.
- Total score.
- Decision.
- Triggered kill rules.
- Evidence references.
- Missing proof.

Scores must be explainable, not just numeric.

## 8. Scoring Architecture

### 8.1 Guide Score

The 30-point score follows the micro-business validation guide.

Categories:

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

Rules:

| Total | Decision |
|---:|---|
| 24 to 30 | Strong candidate. |
| 18 to 23 | Validate deeper. |
| Below 18 | Reject or pivot. |

### 8.2 Pipeline Score

The 100-point score supports richer automation.

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

### 8.3 Kill Rules

Kill rules override scores.

Hard kill examples:

- No high-intent search queries found.
- Existing free solution is simple, trusted, and solves the exact job.
- User must grant scary permissions before seeing value.
- Value cannot be previewed before payment.
- Support burden is likely high.
- Platform/API dependency is unstable or hostile.
- Search traffic is curiosity-only.
- Users clearly search only for free solutions.

## 9. Report Architecture

Report formats:

| Format | Purpose |
|---|---|
| Markdown | Human-readable report and Codex summary input. |
| JSON | UI rendering and downstream automation. |
| PDF | Later export option. |

Required sections:

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
- Missing proof.
- Single next validation action.

Report must separate:

| Label | Meaning |
|---|---|
| Fact | Stored source, quote, prediction, or tool output. |
| Inference | AI/scoring interpretation based on facts. |
| Assumption | Plausible but unproven claim. |
| Missing proof | Evidence required before building. |

## 10. External Collector Architecture

Collectors should be adapter-based.

Common collector interface:

```ts
export interface EvidenceCollector<Input, Output> {
  readonly name: string;
  collect(input: Input): Promise<Output>;
}
```

Each collector should return:

- Raw response metadata.
- Normalized items.
- Errors.
- Rate-limit or block status.

Initial collector priorities:

| Collector | Priority | Reason |
|---|---:|---|
| Autocomplete | 1 | Already implemented; validates search language. |
| SERP | 2 | Finds current pages, competitors, forums, and alternatives. |
| Reddit/forum | 3 | Finds real complaints and workarounds. |
| YouTube | 4 | Finds tutorials and comment pain. |
| Competitor pages | 5 | Finds pricing, positioning, and product gaps. |
| Review mining | 6 | Finds unresolved complaints and payment behavior. |

Provider-specific code should stay inside utility folders, not in the orchestrator.

## 11. Error Handling

Job statuses:

```text
pending
running
completed
failed
stopped
partial
```

Tool run statuses:

```text
pending
running
completed
failed
blocked
skipped
```

Rules:

- CAPTCHA or anti-bot pages should stop the affected collector safely.
- One collector failure should not destroy all prior evidence.
- A job can complete as `partial` when enough evidence exists for a limited report.
- AI failures should be stored in `tool_runs` and surfaced in the report.
- Re-running a job should append new evidence or create a new job, not silently overwrite old evidence.

## 12. Configuration

Proposed config files:

```text
config/
  app.json
  collectors.json
  ai-routes.json
```

Environment variables:

```text
FETCH_TRENDS_DB_PATH
FETCH_TRENDS_RESULTS_DIR
SERP_API_KEY
DATAFORSEO_LOGIN
DATAFORSEO_PASSWORD
YOUTUBE_API_KEY
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
```

The system should run in a reduced local mode without external API keys.

Reduced local mode:

- Autocomplete collection.
- Local scoring.
- Markdown report.
- Optional Codex analysis if Codex CLI is available.

## 13. Testing Strategy

Test layers:

| Layer | Test Type |
|---|---|
| Utilities | Unit tests with fake collectors. |
| DB | Migration and repository tests against temp SQLite files. |
| Orchestrator | Integration tests using fake utilities and fake AI runner. |
| AI output parsing | Golden JSON and malformed-output tests. |
| CLI | Command-level tests for options and output files. |
| Web | Route tests after UI exists. |

Rules:

- Do not hit Google, Reddit, YouTube, or SERP APIs in default tests.
- Use fake collectors for deterministic integration tests.
- Keep existing autocomplete tests passing through the refactor.

## 14. Implementation Phases

### Phase 0: Architecture and Refactor Preparation

Work:

- Keep docs current.
- Move current autocomplete code under `src/utilities/autocomplete/`.
- Preserve `npm run autocomplete`.
- Update imports and tests.

Exit criteria:

- No behavior change.
- Tests, build, and lint pass.

### Phase 1: SQLite Foundation

Work:

- Add SQLite package.
- Add migrations.
- Add DB connection and repositories.
- Add ideas, jobs, tool runs, queries, predictions, scores, reports.
- Add optional persistence to autocomplete.

Exit criteria:

- Autocomplete can write to SQLite.
- Existing CSV/JSON exports still work.

### Phase 2: First Validator CLI

Work:

- Add `validate` command.
- Add simple idea normalization.
- Add deterministic query generation.
- Run autocomplete as first evidence source.
- Store job, queries, predictions, score, and report.

Exit criteria:

- One command turns an idea into a stored validation report.

### Phase 3: AI Runner

Work:

- Add prompt templates.
- Add Codex runner.
- Add JSON schema validation.
- Store AI runs in `tool_runs`.

Exit criteria:

- AI can normalize ideas and generate reports from stored evidence.

### Phase 4: Codex Skills

Work:

- Add project-local skills.
- Wire skills to CLI commands.
- Document usage.

Exit criteria:

- Codex can invoke the validator through local skills.

### Phase 5: More Evidence Collectors

Work:

- Add SERP provider adapter.
- Add Reddit/forum collector.
- Add YouTube search collector.
- Add competitor extraction.
- Add source and evidence extraction.

Exit criteria:

- Reports include evidence beyond autocomplete.

### Phase 6: Web UI

Work:

- Add local server.
- Add idea form.
- Add job status page.
- Add evidence dashboard.
- Add report page.

Exit criteria:

- User can submit and inspect validation jobs in browser.

### Phase 7: Payment Test and SEO Outputs

Work:

- Add landing page draft generator.
- Add fake-door event plan.
- Add SEO page cluster plan.
- Add Search Console import later.

Exit criteria:

- Validator recommends a concrete payment-intent test when evidence supports it.

## 15. First Concrete Refactor

The first implementation step should be:

```text
Move current autocomplete-specific files into src/utilities/autocomplete/
```

Current files to move:

```text
src/analysis.ts
src/collector.ts
src/constants.ts
src/exporter.ts
src/expansion.ts
src/input.ts
src/normalize.ts
src/runner.ts
src/types.ts
```

Likely handling for entrypoints:

```text
src/cli.ts -> keep as compatibility entrypoint
src/utilities/autocomplete/cli.ts -> actual autocomplete command implementation
```

After refactor:

```bash
npm test
npm run build
npm run lint
```

This creates the clean boundary required before adding SQLite, validator orchestration, Codex skills, or web UI.
