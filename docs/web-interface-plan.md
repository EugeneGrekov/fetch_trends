# Web Interface Plan

## Goal

After external collectors are implemented, add a local web interface that lets users submit ideas, run validation jobs, inspect evidence, view scores, and export reports.

The web interface should sit on top of the existing CLI/orchestrator/SQLite pipeline. It must not create a separate validation path.

Core rule:

```text
Web UI submits jobs.
Workers run the existing pipeline.
SQLite remains the source of truth.
Reports render stored evidence.
```

## Prerequisite

Complete and verify:

```text
docs/external-collectors-plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- Autocomplete utility.
- SQLite persistence.
- Minimal validation command.
- AI runner.
- Codex skills.
- External evidence collectors.
- Stored sources, evidence, competitors, scores, and reports.

## Non-Goals

Do not add these in this phase:

- Multi-user authentication.
- Cloud deployment.
- Billing.
- Payment-test landing page hosting.
- Search Console integration.
- Complex distributed queue.
- Team/collaboration features.

This phase is a local single-user dashboard.

## Target Structure

Create:

```text
src/web/
  server.ts
  routes/
    ideas.ts
    jobs.ts
    reports.ts
    evidence.ts
  views/
    layout.ts
    home.ts
    idea-form.ts
    job-status.ts
    idea-dashboard.ts
    evidence-dashboard.ts
    report-view.ts
  assets/
    styles.css

src/commands/
  web.ts
  worker.ts
```

Optional later:

```text
src/web/api/
src/web/components/
```

Keep the first web UI simple. Prefer server-rendered HTML or minimal client-side JavaScript.

## Web Stack

Recommended default:

```text
Fastify or Express
```

Recommended initial approach:

- Server-rendered HTML.
- Small amount of client-side JavaScript for polling job status.
- No heavy frontend framework until the validation flow is stable.

Reason:

- Local-first app.
- Faster implementation.
- Easier testing.
- Lower maintenance.

## Commands

Add:

```bash
npm run web
```

Expected behavior:

```text
Starts local web server.
Prints URL, for example http://localhost:3000.
Uses the configured SQLite database.
```

Add:

```bash
npm run worker
```

Expected behavior:

```text
Runs pending validation jobs from SQLite.
Can be started separately from the web server.
```

For the first implementation, the web server may run jobs in-process if simpler. If so, keep the worker boundary in code so it can be separated later.

## User Flows

### Flow 1: Submit Idea

```text
Open home page
  -> enter idea
  -> optional target market
  -> optional expected price
  -> optional platform
  -> submit
  -> create idea row
  -> create validation job row
  -> redirect to job status page
```

### Flow 2: Watch Job

```text
Job status page
  -> polls /jobs/:id/status
  -> shows current stage
  -> shows collector warnings
  -> redirects or links to dashboard when complete
```

### Flow 3: Inspect Evidence

```text
Idea dashboard
  -> top queries
  -> autocomplete predictions
  -> external sources
  -> evidence quotes
  -> competitors
  -> triggered kill rules
```

### Flow 4: Read Report

```text
Report page
  -> verdict
  -> scores
  -> facts
  -> inferences
  -> assumptions
  -> missing proof
  -> next action
  -> export markdown/json
```

## Pages

| Page | Path | Purpose |
|---|---|---|
| Home | `/` | Explain tool and show idea form. |
| New idea | `/ideas/new` | Submit idea details. |
| Idea dashboard | `/ideas/:id` | Show validation overview. |
| Job status | `/jobs/:id` | Show progress and errors. |
| Evidence | `/ideas/:id/evidence` | Inspect sources, quotes, competitors. |
| Report | `/reports/:id` | Render final report. |
| Settings | `/settings` | Show DB path, API key status, collector availability. |

## API Routes

Even with server-rendered HTML, expose small JSON endpoints for polling and future UI use.

```text
GET  /api/health
POST /api/ideas
GET  /api/ideas/:id
GET  /api/jobs/:id
GET  /api/jobs/:id/status
GET  /api/ideas/:id/evidence
GET  /api/reports/:id
```

Do not expose destructive endpoints in the first version unless needed.

## Job Execution

Initial model:

```text
Web submit
  -> create pending job
  -> in-process worker starts job
  -> status stored in SQLite
```

Later model:

```text
Web submit
  -> create pending job
  -> separate npm run worker process picks job
```

Job statuses:

```text
pending
running
completed
failed
partial
stopped
```

The UI should display partial results when a job is `partial` or `stopped`.

## Evidence Dashboard

The evidence dashboard should prioritize inspectability over polish.

Show:

- Query count.
- Autocomplete prediction count.
- Source count by type.
- Evidence quote count.
- Competitor count.
- Top high-intent queries.
- Top problem-intent queries.
- Strongest complaint quotes.
- Competitor/free alternative table.
- Missing evidence warnings.

Every quote should show its source URL when available.

## Scorecard UI

Show both scores when available:

- 30-point guide score.
- 100-point pipeline score.

Each score row should include:

- Category.
- Score.
- Evidence basis.
- Missing proof.

Show kill rules separately and prominently.

Example:

```text
Kill rule triggered:
Existing free solution appears to solve the exact job in under 3 minutes.
Evidence: [source title/link]
```

## Report Export

Support:

```text
Markdown
JSON
```

Optional later:

```text
PDF
Google Doc
Notion
```

Export should read from stored `reports`, not regenerate unless explicitly requested.

## Settings Page

Show local configuration:

- SQLite DB path.
- Results/artifacts path.
- Codex availability.
- SERP provider configured or missing.
- Reddit configured or missing.
- YouTube configured or missing.
- App version.

Do not reveal API secrets. Show only configured/missing status.

## Visual Direction

Use a practical research-dashboard style:

- Dense but readable.
- Clear evidence tables.
- Strong status labels.
- Minimal decorative UI.
- Fast page loads.
- Mobile usable but desktop-first.

Avoid hiding evidence behind overly polished summaries.

## Data Access Rules

Web routes should use repositories/services, not raw SQL scattered through route handlers.

Preferred layering:

```text
route
  -> service/orchestrator
  -> repository
  -> SQLite
```

Do not duplicate validation logic in route handlers.

## Testing Plan

Add tests for:

- Web server boot with temp SQLite DB.
- `GET /api/health`.
- Idea creation route.
- Job status route.
- Report rendering route.
- Evidence JSON route.
- Settings route with secrets hidden.
- In-process fake worker path.

Use fake collectors and fake AI runner in web integration tests.

Default tests must not hit live external APIs or live Codex.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

Manual smoke test:

```bash
npm run web
```

Then open:

```text
http://localhost:3000
```

Submit a small idea and verify:

- Idea row is created.
- Job row is created.
- Job status updates.
- Dashboard renders.
- Report renders.

## Acceptance Criteria

- `npm run web` starts a local server.
- User can submit an idea from the browser.
- A validation job is created in SQLite.
- Job status is visible.
- Evidence dashboard renders stored evidence.
- Report page renders stored report.
- Markdown and JSON export are available.
- Settings page shows local configuration without exposing secrets.
- No separate validation logic exists in web routes.
- Default tests do not call live external APIs.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Web UI may duplicate CLI/orchestrator logic.
- Job execution can block request handling if not isolated.
- Evidence tables can become too dense.
- API keys or local paths could be accidentally exposed.
- UI can hide uncertainty if report summaries are too prominent.

Mitigations:

- Keep validation in orchestrator/services.
- Use job status polling.
- Render evidence and missing proof prominently.
- Hide secret values.
- Keep the UI local-only by default.

## Recommended Next Phase

After the local web interface works, add payment-test and SEO output generation:

```text
docs/payment-test-and-seo-plan.md
```

That phase should generate landing page drafts, fake-door analytics plans, SEO page clusters, and validation experiment specs from evidence-backed reports.
