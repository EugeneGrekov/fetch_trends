# Web Interface Implementation

## What Was Implemented

The first local web interface slice adds a server-rendered dashboard over the
existing SQLite-backed validation pipeline.

Implemented commands:

```bash
npm run web
npm run worker
```

Implemented pages and APIs:

- `GET /` home page with idea submission form and recent ideas.
- `GET /ideas/new` dedicated idea form.
- `POST /api/ideas` creates an idea row and pending validation job.
- `GET /jobs/:id` renders job status and tool runs.
- `GET /api/jobs/:id` returns job details.
- `GET /api/jobs/:id/status` returns polling-friendly status JSON.
- `GET /ideas/:id` renders the idea dashboard.
- `GET /api/ideas/:id` returns dashboard JSON.
- `GET /ideas/:id/evidence` renders stored evidence, sources, and competitors.
- `GET /api/ideas/:id/evidence` returns evidence JSON.
- `GET /reports/:id` renders the stored report.
- `GET /reports/:id?format=markdown` exports stored report markdown.
- `GET /reports/:id?format=json` exports stored report JSON.
- `GET /settings` renders local paths and configured/missing collector status.
- `GET /api/health` checks migrations and queued/running job counts.

## Architecture Notes

The web server is implemented with Node's built-in HTTP server to keep the local
slice dependency-light. It uses server-rendered HTML and a small polling script
on the job status page.

Routes do not contain validation logic or scattered raw SQL. They call the web
service layer, which uses existing repositories and the validation orchestrator.

The orchestrator now accepts optional `ideaId` and `jobId` values. This lets the
web UI create a queued idea/job first, then run the existing pipeline against
those rows instead of creating a duplicate validation path.

## Job Execution

Default web behavior:

```text
Submit idea
  -> create idea
  -> create pending job
  -> start in-process worker
  -> worker calls validation orchestrator
  -> SQLite stores status, tool runs, scores, and reports
```

Separate worker behavior:

```bash
npm run web -- --run-jobs false
npm run worker -- --limit 1
```

## Local Run

```bash
npm run web
```

Then open:

```text
http://127.0.0.1:3000
```

Optional flags:

```bash
npm run web -- --db ./data/fetch-trends.sqlite --port 3000 --run-jobs true --ai false
npm run worker -- --db ./data/fetch-trends.sqlite --limit 1 --ai false
```

## Testing

The web integration test starts the server on an ephemeral local port with:

- temp SQLite database
- fake autocomplete collector
- AI disabled
- no live Google/API/Codex calls

Covered paths:

- server boot
- health API
- settings page with secrets hidden
- idea creation API
- in-process fake worker completion
- job page/status API
- idea dashboard
- evidence page/API with seeded stored evidence
- report view and markdown/JSON export

## Current Limitations

- The first slice is server-rendered and intentionally minimal.
- Job execution is process-local; it is not a distributed queue.
- The web UI can render external evidence tables, but live external collectors
  are only shown when upstream pipeline stages store those rows.
- Report export supports markdown and JSON only.
