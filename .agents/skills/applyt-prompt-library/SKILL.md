---
name: applyt-prompt-library
description: Fetch Applyt provider prompt templates and per-job provider prompt/command interactions from the admin-only prompt store. Use when asked to fetch prompts for an Operating System id, show a prompt sequence for a job id, inspect provider prompt hashes/status, compare prompt metadata, or export active Base44/Provider prompt templates.
---

# Applyt Prompt Library

## Overview

Use this skill to inspect internal Applyt provider prompt records through repo scripts. Full prompt text is admin/local only and must never be shown unless the user explicitly asks for it.

## Safety Rules

- Use `scripts/prompt_templates.js` and `scripts/prompt_interactions.js` before any manual table query.
- Default to metadata and hashes only. Add `--full` only when the user explicitly asks for full prompt/template text.
- Never print Supabase service-role keys, OAuth tokens, bearer tokens, tokenized URLs, raw Provider/Base44 preview URLs, or raw Provider runtime URLs.
- Do not use prompt tables for browser/user-facing UI. Keep user-visible OS history on `operating_system_job_events`.
- Stay in DEV unless the user explicitly names another environment. Do not mutate PROD.

## Commands

Fetch prompt sequence for an Operating System id:

```bash
node scripts/prompt_interactions.js by-os <operating_system_id> --env dev
```

Show prompt sequence for a job id:

```bash
node scripts/prompt_interactions.js by-job <job_id> --env dev
```

Fetch machine-readable metadata:

```bash
node scripts/prompt_interactions.js by-job <job_id> --json --env dev
```

Print full prompt text only when requested:

```bash
node scripts/prompt_interactions.js by-job <job_id> --full --env dev
```

List active Base44 templates:

```bash
node scripts/prompt_templates.js list --provider base44 --active --env dev
```

Export active Base44 create template:

```bash
node scripts/prompt_templates.js export os.base44.create.master --active --full --env dev
```

## Workflow

1. Identify whether the user provided an OS id, job id, or template key.
2. Run the matching script from the repo root with `--env dev` unless the user specified `test` or `prod`.
3. Report only ids, sequence order, provider, operation, kind, status, hashes, and errors by default.
4. If the user asked for full prompt text, include only the relevant `--full` output and keep any secrets/tokenized URLs redacted.
5. If the scripts fail because credentials or tables are unavailable, report the exact blocker. Do not switch to manual SQL unless the script path is unavailable and the user still needs a read-only answer.
