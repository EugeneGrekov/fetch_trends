# SQLite Foundation Implementation Notes

## Summary

This batch introduces the SQLite persistence foundation for the validation pipeline.

The implementation defines the core database schema, adds repository helpers for the main validation entities, and extends the schema for external evidence storage.

## What Was Added

### Migrations

The schema is applied in two steps:

1. `001_initial_validation_tables`
2. `002_external_evidence_tables`

The initial migration creates the core validation tables:

```text
ideas
jobs
tool_runs
queries
autocomplete_predictions
scores
reports
```

The second migration adds the evidence-enrichment tables:

```text
sources
evidence
competitors
```

Both migrations are recorded in `schema_migrations`, and the migration runner is idempotent.

### Schema Layer

`src/db/schema.ts` now defines row and input types for:

```text
ideas
jobs
tool_runs
queries
autocomplete_predictions
scores
reports
sources
evidence
competitors
```

That keeps the repository layer strongly typed around the SQLite schema.

### Repository Layer

Repository helpers were added for the new SQLite tables, including create/list operations for:

```text
sources
evidence
competitors
```

The existing repository test coverage exercises the full persistence path by creating an idea, job, tool run, autocomplete predictions, sources, evidence, competitors, scores, and reports in one flow.

## Behavioral Notes

- The migrations are additive and keep the database upgrade path simple.
- The repository helpers insert rows and immediately reload them so callers get the persisted row shape back.
- Ordering in list helpers is explicit so downstream report generation is stable.

## Verification Coverage

The SQLite foundation is covered by targeted tests for:

```text
src/db/migrations.test.ts
src/db/repositories/repositories.test.ts
```

Those tests assert schema creation, migration idempotency, and repository round-trips.

## Scope

This batch is still infrastructure only.

It does not add:

```text
web UI
AI orchestration
validation command routing
runtime collectors beyond the existing repository layer
```
