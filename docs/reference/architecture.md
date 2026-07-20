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
    export-data.ts
    backup.ts
    restore.ts
    web.ts
    worker.ts
    portfolio.ts

  export/
    bundle-writer.ts
    bundle-reader.ts
    backup.ts
    restore.ts
    redaction.ts
    types.ts
    measurement.ts
    decide.ts
    revalidate.ts
    diagnose.ts

  decision-loop/
    decision-engine.ts
    learning-history.ts
    next-experiment.ts
    pivot-generator.ts
    types.ts

  portfolio/
    comparison-report.ts
    portfolio-loader.ts
    portfolio-ranker.ts
    portfolio-scorer.ts
    types.ts

  revalidation/
    stale-evidence.ts
    scheduler.ts
    queue.ts
    revalidation-runner.ts
    revalidation-report.ts
    types.ts

  diagnostics/
    config-check.ts
    db-health.ts
    job-health.ts
    collector-health.ts
    artifact-health.ts
    command-health.ts
    report.ts
    types.ts

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

    reviews/
      collector.ts
      types.ts

  validation/
    orchestrator.ts
    idea-normalizer.ts
    query-generator.ts
    evidence-extractor.ts
    external-evidence.ts
    source-normalizer.ts
    complaint-extractor.ts
    competitor-analyzer.ts
    scoring.ts
    report-generator.ts
    types.ts

  measurement/
    event-recorder.ts
    metrics-aggregator.ts
    threshold-evaluator.ts
    decision-report.ts
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
  README.md
  features/architecture-roadmap/plan.md
  reference/architecture.md

scripts/
  release-check.ts
  package-local.ts
  release-support.ts

config/
  collectors.json
  example.env

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
| `measurement` | Import local experiment events, evaluate thresholds, and persist measurement reports. |
| `decide` | Turn stored validation and measurement evidence into one decision memo and next action. |
| `revalidate` | Scan for stale evidence, queue local revalidation tasks, run pending tasks, and persist refreshed score/report snapshots. |
| `portfolio` | Compare multiple stored ideas by evidence strength, risk, cost to test, and next action. |
| `export-data` | Export one idea bundle or a portfolio summary from local SQLite data. |
| `backup` | Create a timestamped local backup of the SQLite database and selected artifact directories. |
| `restore` | Restore a verified local backup into a target SQLite database and optional artifact directories. |
| `diagnose` | Run local operator diagnostics for configuration, DB, jobs, collectors, artifacts, and commands. |
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

### 4.3 Export And Backup

Export and backup helpers are a local filesystem boundary over SQLite-backed evidence and generated artifacts.

Responsibilities:

- Build deterministic idea and portfolio export bundles from SQLite rows.
- Apply optional redaction for sharing exports.
- Copy database and artifact directories into timestamped backup folders.
- Validate backup manifests before restoring into explicit target paths.

Rules:

- Export bundles stay local-first and should not require live services.
- Backup and restore must be deterministic and refuse unsafe overwrites unless explicitly forced.
- ZIP packaging may be added later, but JSON and Markdown exports are the first supported formats.

Example:

```text
Autocomplete utility
  input: mode, seeds, country, language, depth, optional modifier allowlist
  output: CSV/JSON/Markdown sidecars, generated prefixes, exact returned predictions, source metadata, relevance summary, errors
```

### 4.4 Validation Orchestrator

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

### 4.5 SQLite Layer

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

### 4.6 AI Runner

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

### 4.7 Web UI

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

Current implementation:

- `npm run web` starts a dependency-light Node HTTP server.
- `npm run worker` runs pending SQLite jobs outside the web process.
- `src/web/services.ts` is the web boundary for repositories and the
  validation orchestrator.
- Routes render server-side HTML and expose small JSON APIs for polling.
- Report export reads stored `reports` rows as markdown or JSON.

### 4.8 Decision Loop

The decision loop is the idea-level operating layer over validation and measurement records.

Responsibilities:

- Load the current idea, latest experiment, measurement snapshot, validation reports, scores, evidence, and prior decisions.
- Apply deterministic rules before any narrative drafting.
- Return one of `build_mvp`, `persevere`, `pivot`, `validate_deeper`, `kill`, or `inconclusive`.
- Generate a learning history so repeated tests and decisions remain visible.
- Generate pivot options only when stored evidence supports a pivot.
- Generate exactly one next action.
- Persist a `decision_memo` report and an `idea_decisions` ledger row.

Rules:

- Low sample size or missing behavior data is `inconclusive`.
- The decision loop does not collect new evidence, process payments, or compare a portfolio of ideas.
- AI may draft narrative later, but deterministic decision values remain the source of truth.

### 4.9 Portfolio Comparison

Portfolio comparison is the local cross-idea ranking layer over stored validation, measurement, and decision records.

Responsibilities:

- Load multiple ideas and their latest evidence snapshots from SQLite.
- Rank ideas by evidence quality, payment signal strength, risk, recency, and next-action clarity.
- Surface practical buckets: `test_next`, `validate_deeper`, `watch`, `park`, and `kill`.
- Keep kill rules visible so the aggregate score does not hide them.
- Generate a stored comparison report plus Markdown and JSON artifacts.

Rules:

- The portfolio score is separate from validation, measurement, and decision scores.
- Missing proof lowers confidence instead of being ignored.
- The comparison layer does not call live external services.
- Optional web dashboard support may be added later, but CLI/report coverage is the first-class implementation.

### 4.10 Operator Diagnostics

Operator diagnostics are a read-only local inspection layer over the CLI, SQLite database, collector configuration, artifacts, and package scripts.

Responsibilities:

- Explain missing or broken local setup without mutating data.
- Check DB file health, required tables, migrations, row counts, and SQLite integrity.
- Surface failed jobs, stale pending/running jobs, failed or blocked tool runs, and completed validation jobs without reports.
- Report collector readiness from local config and environment presence only.
- Check generated artifact references, orphan files, artifact directory size, and configured backup/export directories.
- Produce human-readable Markdown and JSON reports.

Rules:

- Do not apply migrations, repair databases, delete artifacts, or auto-fix commands.
- Do not print API key or secret values; report only configured or missing.
- Do not call live external services by default.
- Live diagnostics must remain explicitly opt-in and must not be used by default tests.

### 4.11 Codex Skills

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

### 4.12 Scheduled Revalidation

Scheduled revalidation is the local maintenance layer for validation evidence.

Responsibilities:

- Evaluate evidence age by source family.
- Queue explicit refresh tasks instead of silently changing evidence.
- Run pending queue items through injectable collector/service boundaries.
- Append refreshed evidence, scores, and reports as new rows.
- Mark unavailable collectors as blocked or skipped rather than crashing.
- Generate a revalidation report that separates stale evidence, refreshed evidence, blocked tasks, score changes, and next action.

Rules:

- Historical evidence is never overwritten.
- Measurement events and decisions are historical facts. They are not automatically stale, though later snapshots can supersede earlier interpretations.
- Revalidation is local and explicit. There is no daemon or cloud scheduler in the first implementation.
- Portfolio refresh can now reference the portfolio comparison workflow instead of a placeholder marker.

### 4.13 Release Packaging

Release packaging is the local verification and handoff layer.

Responsibilities:

- Keep install and command documentation aligned with `package.json`.
- Verify build output, package bin paths, required docs, local Codex skills, and migration readiness.
- Run tests, build, lint, and diagnostics when diagnostics are exposed by the current checkout.
- Provide a local package directory for inspection without publishing to npm or a global Codex marketplace.
- Exclude generated local data from package outputs.

Rules:

- Release checks must not call live external APIs, live Codex, payment providers, Search Console, analytics services, or hosted infrastructure.
- Package outputs may include runtime code, docs, prompts, nonsecret config, and local Codex skills.
- Package outputs must not include SQLite DBs, `results/`, `artifacts/`, backups, exports, `.env` files, logs, or resume files.
- `diagnose` is optional in release checks until the diagnostics command is wired into `package.json`; missing diagnostics should produce a warning, not a false pass.

### 4.13 Roadmap Governance

Roadmap governance is the local process layer for phase sequencing, verification, documentation, and retirement.

Responsibilities:

- Keep `docs/governance/implementation-order.md` aligned with phase plans and implementation notes.
- Define lifecycle statuses for proposed, planned, delegated, in-progress, implemented, verified, deferred, retired, superseded, and blocked phases.
- Provide templates for future phase plans and implementation notes.
- Check roadmap structure offline without calling live collectors, Codex, payment providers, Search Console, analytics services, or hosted infrastructure.

Rules:

- Governance does not add product runtime behavior, collectors, database tables, cloud project management integration, issue tracker sync, multi-user assignment, or AI-only prioritization.
- `npm run roadmap:check` is a documentation and process check only.
- New phases after roadmap governance should be created from templates and retired explicitly when they no longer fit the evidence-first local flow.

### 4.14 Backlog Prioritization

Backlog prioritization is the local decision layer for ranking candidate work
before it becomes a planned implementation phase.

Responsibilities:

- Provide a standard backlog item template for candidate phases and
  documentation work.
- Document a consistent scoring model based on evidence impact, reliability
  impact, user decision speed, workflow frequency, implementation cost,
  dependency risk, reversibility, and strategic alignment.
- Keep prioritization offline and deterministic with a small documentation
  checker.

Rules:

- Backlog prioritization is a decision aid, not an automatic planning system or
  AI-only ranking mechanism.
- `npm run backlog:check` validates guide/template structure and optional
  backlog item files without calling live services.
- Candidate work should become a phase plan only after the backlog item has a
  clear problem statement, evidence basis, and acceptance criteria.

## 5. Data Flow

### 5.1 Autocomplete-Only Flow

```text
CLI command
  -> autocomplete utility
  -> generated prefixes
  -> Google Autocomplete collector
  -> exact returned predictions with source metadata
  -> normalization/relevance classification/evidence scoring
  -> CSV/JSON/Markdown export
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
  -> POST /api/ideas
  -> create idea row
  -> create pending job row
  -> redirect to job page
  -> in-process or separate worker runs existing orchestrator
  -> UI polls status
  -> UI renders stored evidence, score, and report rows
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

### 5.5 Post-Launch Measurement Flow

```text
Stored payment-test report
  -> experiment row
  -> manual CSV or single-event imports
  -> raw experiment_events rows
  -> deterministic metrics aggregation
  -> threshold evaluation against stored payment-test thresholds
  -> measurement snapshot
  -> measurement report
  -> experiment decision
```

Measurement is local-first. It does not call analytics providers, payment processors, Search Console, Google Analytics, or email systems.

### 5.6 Scheduled Revalidation Flow

```text
CLI scan
  -> load idea evidence snapshots
  -> evaluate source/evidence age rules
  -> create revalidation_queue rows
  -> CLI run-pending
  -> run available refresh services or mark tasks blocked/skipped
  -> append new evidence rows
  -> append new score snapshot
  -> append revalidation report
  -> preserve historical evidence and reports
```

### 5.7 Operator Diagnostics Flow

```text
npm run diagnose
  -> resolve local paths and environment presence
  -> inspect package scripts and collector config
  -> open SQLite read-only when available
  -> inspect jobs, tool runs, reports, migrations, and artifacts
  -> render Markdown or JSON report with next actions
```

Diagnostics are informational. They do not collect evidence, call providers, run Codex, launch Playwright, apply migrations, or repair local data.

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
| `experiments` | Launched validation experiment metadata and stored threshold JSON. |
| `experiment_events` | Raw behavior events imported manually or from local files. |
| `measurement_snapshots` | Aggregate metric and threshold-evaluation snapshots. |
| `experiment_decisions` | Decision snapshots linked to measurement reports. |
| `revalidation_rules` | Default local freshness windows and recommended task mappings. |
| `revalidation_queue` | Explicit local queue of stale-evidence refresh tasks. |
| `revalidation_runs` | Scan and run-pending lifecycle records with JSON summaries. |

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

experiments
- id
- idea_id
- report_id
- experiment_type
- title
- status
- threshold_json
- created_at
- launched_at
- completed_at

experiment_events
- id
- experiment_id
- event_name
- occurred_at
- source
- session_id
- metadata_json
- created_at

measurement_snapshots
- id
- experiment_id
- metrics_json
- threshold_results_json
- created_at

experiment_decisions
- id
- experiment_id
- decision
- reason
- report_id
- created_at

revalidation_rules
- id
- evidence_type
- stale_after_days
- task_type
- enabled
- created_at
- updated_at

revalidation_queue
- id
- idea_id
- task_type
- status
- reason
- stale_reason_json
- run_id
- created_at
- updated_at
- started_at
- completed_at
- error_message

revalidation_runs
- id
- idea_id
- mode
- status
- started_at
- completed_at
- summary_json
- error_message
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
- Measurement reports use `report_type = measurement_report`.
- Measurement decisions are snapshots. Re-evaluating an experiment creates new snapshot, report, and decision rows rather than overwriting prior decisions.
- Raw experiment events are stored before metrics or recommendations are generated.
- Revalidation queue and run rows are lifecycle records. Evidence refreshes append new evidence/source/competitor/prediction rows.
- Revalidation scores use `score_type = revalidation_search_language`.
- Revalidation reports use `report_type = revalidation_report`.
- Blocked or skipped revalidation tasks are stored as queue statuses and do not delete stale evidence.

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
| Organic wording evidence | 10 |
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

- No relevant organic exact predictions found.
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
FETCH_TRENDS_ARTIFACTS_DIR
FETCH_TRENDS_BACKUP_DIR
FETCH_TRENDS_EXPORT_DIR
SERP_API_KEY
DATAFORSEO_LOGIN
DATAFORSEO_PASSWORD
YOUTUBE_API_KEY
REDDIT_CLIENT_ID
REDDIT_CLIENT_SECRET
```

Current implementation note:

- The first live external provider path is `SERP_API_KEY` via SerpApi.
- Reddit, YouTube, and review discovery currently reuse the configured SERP provider instead of calling direct platform APIs.
- Competitor collection fetches candidate pages directly after SERP discovery.
- Missing provider configuration must degrade to warnings and blocked tool runs rather than failing the whole validation job.
- `npm run diagnose` reads these settings safely and reports secret variables only as configured or missing.

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
| Diagnostics | Temp SQLite, temp directories, mocked env, and no live service calls. |
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
- Existing CSV/JSON/Markdown exports still work.

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
