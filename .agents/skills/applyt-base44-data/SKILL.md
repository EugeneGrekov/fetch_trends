---
name: applyt-base44-data
description: Diagnose Applyt Operating System and Base44 runtime data through Supabase and Provider probes. Use when investigating `/operating-systems/:id` or `/run` pages that do not open, Base44/Provider preview loading, proxy tickets, runtime cache, screenshots, Base44 OAuth health, or questions about cached versus live OS runtime behavior.
---

# Applyt Base44 Data

## Overview

Use this skill to inspect Applyt's Base44-backed Operating System runtime state without leaking credentials or mutating data. Default to read-only DEV diagnostics unless the user explicitly asks for a change.

## Safety Rules

- Do not touch PROD unless the user explicitly asks for PROD. DEV is project `pdrvjjijsmmxtyngoplc`; PROD is `jorctscopnxiptuunyev`.
- Treat `embed_url`, `direct_url`, `provider_base_url`, and any URL containing `_preview_token` as secret-bearing. Do not paste raw tokenized URLs into chat, issues, logs, or docs.
- Never print Supabase service-role keys, Base44 OAuth tokens, refresh tokens, encrypted credential payloads, or raw `_preview_token` values.
- Prefer hashes, booleans, origins, timestamps, HTTP status, and classifier results.
- Do not update DB rows, clear screenshots, regenerate workspaces, invoke mutating functions, or deploy Edge Functions unless the user explicitly requests it.
- Use the project `supabase` skill for Supabase-specific implementation or schema work.

## Workflow

1. Read the relevant docs before interpreting data:
   - `documentation/OPERATING_SYSTEM_RUNTIME_PROXY.md`
   - `documentation/OPERATING_SYSTEMS.md` when the task is broader than proxy/runtime opening
2. Confirm the target environment:
   - Inspect `.env.local`, `.env`, and `supabase/config.toml` for the project ref.
   - Stay on DEV unless explicitly told otherwise.
3. Start with Edge Function logs and sanitized DB state:
   - Use Supabase MCP `get_logs` for `edge-function` when available.
   - Use MCP `execute_sql` or the bundled script below for read-only inspection.
4. Classify the failure:
   - `os-runtime-ticket` 200 + `os-runtime-proxy` 202 means Provider loading, not Applyt route failure.
   - Provider HTML with title `Preview Loading - Base44` means Base44 sandbox/build output is not ready.
   - Provider login/auth HTML means the cached URL/token or Provider access path is not usable.
   - 401/403 from proxy usually means Applyt proxy ticket expiry, mismatch, or scope rejection.
5. Report the cause with exact timestamps and sanitized evidence. State clearly whether the evidence proves token expiry, Provider loading, OAuth failure, missing app id, missing runtime URL, or only supports a weaker hypothesis.

## Quick Diagnostic Script

Run from the repo root:

```bash
bash .agents/skills/applyt-base44-data/scripts/os-runtime-diagnostic.sh --os-id <operating_system_id>
```

Options:

- `--env-file <path>`: use a specific env file, default `.env.local` then `.env`.
- `--ticket-limit <n>`: number of recent proxy tickets to summarize, default `10`.
- `--skip-provider-fetch`: skip direct Provider runtime fetch/classification.
- `--json`: output raw JSON only.

The script loads `SUPABASE_URL`/`VITE_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, queries protected Applyt tables through Supabase REST, and prints sanitized hashes/classifications only. It clears `NODE_OPTIONS` in the wrapper because this repo's env files can enable `--inspect-brk`.

## Manual SQL

Use `references/sanitized-queries.md` when the script is unavailable, when you need custom SQL through MCP, or when you need to explain the meaning of runtime cache/ticket fields.

Core tables:

- `operating_system_apps`
- `operating_system_runtime_cache`
- `operating_system_proxy_tickets`
- `operating_system_jobs`
- `operating_system_job_events`
- `base44_connections`

## Interpretation Rules

- `status = ready` on `operating_system_apps` means Applyt previously completed the OS. It does not guarantee the Provider sandbox is currently serving app HTML.
- `runtime_cache.last_ready_at` means a Provider URL once served usable runtime; it is not a durable app copy.
- `runtime_health.status = preview_loading` means the current cache/probe path is waiting on Provider/Base44.
- Recent tickets matching the cached tokenized URL show Applyt fell back to cache or used a cache fast path. This does not by itself prove `_preview_token` expiry.
- Direct Provider fetch returning `503` + `Preview Loading - Base44` proves current Provider loading/startup behavior. It does not prove Applyt auth failure or token expiry.
- Provider login/auth HTML is stronger evidence that the tokenized URL or Provider access path is not usable.
- Healthy `base44_connections` with future `token_expires_at`, recent `last_success_at`, and null `last_error` argues against Applyt's Base44 OAuth connection being the blocker.

## Reporting

Include:

- OS id, app status, ready timestamps, runtime health status/reason/checked time.
- Whether runtime cache and recent tickets are tokenized and whether ticket hashes match cached URL hashes.
- Provider fetch status/title/classification if checked.
- Edge Function status pattern, especially `os-runtime-ticket` and `os-runtime-proxy`.
- A concise conclusion that distinguishes confirmed facts from inferences.
