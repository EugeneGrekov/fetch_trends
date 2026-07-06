---
name: supabase-long-jobs
description: Use when implementing, reviewing, or refactoring Supabase workflows that may take longer than a normal Edge Function request, especially multi-minute jobs, third-party API orchestration, job progress tracking, retryable processing, pg_cron, pg_net, Supabase Queues, polling, or Realtime updates.
---

# Supabase Long Jobs

## Goal

Implement long-running Supabase workflows as resumable jobs, not as one long Edge Function request.

Use this skill when the user asks to build or fix a Supabase process that:
- may take more than 1-2 minutes
- calls third-party APIs repeatedly
- needs progress updates in the web app
- needs retry, resume, or failure recovery
- must work without an external worker
- uses Supabase Edge Functions, Postgres, pg_cron, pg_net, Queues, Realtime, or polling

## Core rule

Never implement this flow:

```text
Frontend -> Edge Function -> wait several minutes -> return final response
```

Implement this flow:

```text
Frontend -> start_job -> return job_id immediately
Scheduled process_jobs -> process small resumable steps
Frontend -> poll or subscribe to job progress
```

## Required architecture

Use Supabase as the job control plane.

Required parts:

1. `jobs` table stores durable state.
2. `start_job` Edge Function creates the job and returns `job_id`.
3. `process_jobs` Edge Function processes only a small unit of work per invocation.
4. `pg_cron` + `pg_net` schedules `process_jobs`.
5. Frontend shows progress by polling the `jobs` table or using Supabase Realtime.
6. Every step must be resumable from database state.
7. Function memory must never be required between runs.
8. Use locking to avoid two invocations processing the same job.

## Required job states

Use these states unless the existing codebase already has an equivalent enum:

```text
queued
running
completed
failed
```

Optional states:

```text
cancelled
retrying
waiting_external_api
```

## Required `jobs` fields

Create or reuse a table with these fields:

```text
id
user_id
status
progress_percent
current_step
result_json
error_message
locked_until
attempt_count
created_at
updated_at
```

Optional but useful fields:

```text
input_json
partial_result_json
external_job_id
next_run_at
completed_at
failed_at
```

## Optional `job_steps` table

Use this when the workflow has multiple named steps or needs audit/debug history.

Recommended fields:

```text
id
job_id
step_name
status
input_json
output_json
error_message
attempt_count
started_at
completed_at
created_at
updated_at
```

## `start_job` function requirements

The `start_job` Edge Function must:

1. Validate the authenticated user.
2. Validate input.
3. Create a `jobs` row with `status = queued`.
4. Store the input payload in the database.
5. Return `{ job_id }` immediately.
6. Never wait for the full workflow to finish.

Expected response:

```json
{
  "job_id": "uuid",
  "status": "queued"
}
```

## `process_jobs` function requirements

The `process_jobs` Edge Function must:

1. Find one eligible job:
   - `status in ('queued', 'running')`
   - not locked, or `locked_until < now()`
   - optional: `next_run_at <= now()`
2. Lock the job with `locked_until`.
3. Mark it as `running`.
4. Load the saved job state from Postgres.
5. Execute only the next safe step.
6. Save partial output to Postgres.
7. Update:
   - `progress_percent`
   - `current_step`
   - `status`
   - `error_message`
   - `updated_at`
8. Mark the job `completed` only when all steps are done.
9. Mark the job `failed` only after retry rules are exhausted.
10. Return quickly.

## Locking requirement

Use database locking or an atomic update pattern.

Do not process a job unless the current function invocation has successfully locked it.

Acceptable patterns:

```sql
select ... for update skip locked
```

or atomic update:

```sql
update jobs
set locked_until = now() + interval '2 minutes'
where id = (
  select id
  from jobs
  where status in ('queued', 'running')
    and (locked_until is null or locked_until < now())
  order by created_at
  limit 1
)
returning *;
```

Adapt to the existing project style.

## Step design

Break the long process into small steps.

Good:

```text
analyze_input
create_blueprint
call_third_party_api_step_1
save_partial_result
call_third_party_api_step_2
generate_final_result
```

Bad:

```text
generate_everything
```

Each step must be safe to retry.

## Retry design

For third-party API failures:

1. Store the error in `error_message` or `job_steps.error_message`.
2. Increment `attempt_count`.
3. Use bounded retries.
4. Use backoff through `next_run_at` if available.
5. Never lose partial progress.
6. Do not duplicate third-party side effects if the API is not idempotent.

Prefer idempotency keys when the third-party API supports them.

## Scheduling

For Supabase-only architecture, use:

```text
pg_cron -> pg_net -> process_jobs Edge Function
```

Recommended interval for MVP:

```text
every 1 minute
```

Do not assume Supabase Queue messages run themselves. A consumer is still needed. In a Supabase-only design, the consumer is the scheduled `process_jobs` function.

## Frontend progress

Use one of:

1. Polling, recommended for MVP.
2. Supabase Realtime, recommended for smoother UX.
3. Realtime plus polling fallback, recommended for production.

Polling rule:

```text
Poll job status every 2-5 seconds.
Stop polling when status is completed, failed, or cancelled.
```

UI should show:

```text
status
progress_percent
current_step
error_message if failed
result link or result object when completed
```

## Security

Required:

1. User can only read their own jobs.
2. User can only start jobs for themselves.
3. Service role key must never be exposed to frontend.
4. Scheduled processing function may use service role server-side only.
5. Add RLS policies for `jobs` and `job_steps`.
6. Store third-party API keys only in Supabase secrets or server environment.

## When to recommend an external worker

If the user allows external infrastructure, recommend an external worker for:
- high volume
- strict reliability
- many concurrent jobs
- jobs longer than hosted Edge Function limits
- complex retries
- expensive third-party API orchestration
- strong observability requirements

But if the user explicitly asks for "without external worker", use the Supabase-only scheduled-step architecture.

## Implementation checklist

Before writing code, inspect the existing project for:
- Supabase client setup
- migrations directory
- Edge Functions structure
- auth pattern
- frontend data fetching pattern
- existing job/task tables
- existing Realtime or polling utilities

Then implement minimally:

1. Migration for `jobs`.
2. Optional migration for `job_steps`.
3. `start_job` Edge Function.
4. `process_jobs` Edge Function.
5. SQL schedule using `pg_cron` and `pg_net`.
6. Frontend hook or helper for job progress.
7. Basic tests or manual test instructions.
8. Documentation in the project README or relevant docs file.

## Acceptance criteria

The implementation is correct only if:

1. Frontend receives `job_id` immediately.
2. No HTTP request waits for the full multi-minute workflow.
3. Progress is visible from the database.
4. A failed step can be retried.
5. Job state survives function restarts.
6. Two processors cannot process the same job at the same time.
7. The user can close the browser and return later to see the job status.
8. The final result is stored in Postgres or linked from Postgres.
