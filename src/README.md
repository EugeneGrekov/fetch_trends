# Source

This directory contains the TypeScript implementation for the local evidence-first validator.

Main areas:

- `ai/` loads prompts and runs bounded AI calls.
- `commands/` contains command handlers.
- `db/` owns SQLite connection, migrations, schema, and repositories.
- `utilities/` contains collectors and reusable evidence-gathering utilities.
- `validation/` orchestrates idea validation and report generation.
- `measurement/` stores and evaluates experiment behavior.
- `decision-loop/` produces pivot, persevere, kill, or validate-deeper recommendations.
- `revalidation/` detects stale evidence and queues follow-up work.
- `diagnostics/` checks local setup health.
- `web/` serves the local interface.
- `testing/` provides deterministic fixtures and fakes.

Keep runtime behavior local-first and keep tests independent of live services by default.
