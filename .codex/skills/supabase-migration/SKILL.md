---
name: supabase-migration
description: Migrate or clone a Supabase project using database dump and restore, Storage object copy, Edge Function deployment, private configuration handling, verification, and rollback guidance.
---

# Supabase Migration Skill

Use this skill when the task is to migrate, clone, export, import, or back up a Supabase project.

## Core rule

Supabase does not provide one native full-project export/import command. This repo implements a repo-level orchestrator that combines several required steps into one command.

A full migration must handle these parts separately:

1. Postgres roles, schema, and data.
2. Auth database state.
3. Storage bucket metadata.
4. Storage object files.
5. Edge Functions.
6. Private Edge Function configuration.
7. Auth provider settings.
8. SMTP settings.
9. Realtime publications.
10. Extensions and database settings.
11. Application environment variables.
12. Old project references in app code and deploy settings.

## Installed files

- `scripts/supabase-migrate-full.sh`
- `scripts/supabase-copy-storage.mjs`
- `scripts/supabase-verify-migration.mjs`
- `supabase-migration.env.example`
- `documentation/SUPABASE_MIGRATION_RUNBOOK.md`
- `documentation/SUPABASE_MIGRATION_REPORT_TEMPLATE.md`

## Commands

```bash
npm run supabase:migrate:full
npm run supabase:migrate:storage
npm run supabase:migrate:verify
```

## Required local setup

```bash
cp supabase-migration.env.example .env.supabase-migration
```

Fill the values manually. Do not commit local migration env files.

## Safety gates

Before database restore, the script requires one of these:

```bash
CONFIRM_TARGET_PROJECT_EMPTY=true
```

or:

```bash
ALLOW_OVERWRITE_TARGET=true
```

Do not bypass this guard.

## Production rule

Do not deploy Edge Functions to PROD unless the user explicitly asks for PROD. This follows the repository rule in `AGENTS.md`.

## Required first inspection

Before changing migration behavior, inspect:

1. `package.json`
2. `AGENTS.md`
3. `scripts/supabase-migrate-full.sh`
4. `scripts/supabase-copy-storage.mjs`
5. `scripts/supabase-verify-migration.mjs`
6. `documentation/SUPABASE_MIGRATION_RUNBOOK.md`
7. `supabase/functions/`
8. `supabase/config.toml`, if present

## Do not do

- Do not display private env values.
- Do not commit local migration env files.
- Do not delete the old Supabase project.
- Do not assume Storage object files are included in a database dump.
- Do not assume private Edge Function configuration is included in function deployment.
- Do not assume OAuth providers, SMTP, custom domains, Vault data, cron jobs, or webhooks move automatically.
- Do not claim this is a native Supabase one-command full export/import.

## Implementation behavior

The full migration command should:

1. Load `.env.supabase-migration`.
2. Validate required tools and env vars.
3. Create a timestamped backup/report directory.
4. Dump database roles, schema, and data.
5. Restore database into the target project.
6. Copy Storage object files from old project to new project.
7. Deploy local Edge Functions to the target project.
8. Apply private Edge Function configuration from a local env file, when provided.
9. Run verification.
10. Produce report files.

## Verification behavior

Verification should classify checks as:

- `PASS`
- `WARN`
- `FAIL`
- `MANUAL_CHECK_REQUIRED`

The verification script should compare database row counts, Storage bucket and object counts, RLS-enabled tables, Edge Function listing access, and old Supabase URL references in local env files.
