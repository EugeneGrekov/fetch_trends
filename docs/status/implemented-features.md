# Implemented Features

## Purpose

This file audits what appears implemented in this checkout as of 2026-07-21.

The audit is based on:

- `docs/governance/implementation-order.md`
- implementation notes in `docs/features/*/implementation.md`
- package scripts and bin entries in `package.json`
- source modules under `src/`
- project-local Codex skills under `.codex/skills/`

## Status Summary

| Feature | Roadmap Status | Implementation Evidence | Notes |
|---|---|---|---|
| Architecture and roadmap | `verified` | `docs/features/architecture-roadmap/plan.md`, `docs/reference/architecture.md`, `docs/governance/implementation-order.md` | Product direction and phase sequence are documented. |
| Autocomplete utility refactor | `verified` | `src/utilities/autocomplete/`, `src/cli.ts`, `docs/features/autocomplete-refactor/implementation.md` | Existing autocomplete behavior is isolated as a utility. |
| SQLite foundation | `verified` | `src/db/`, `src/db/repositories/`, `npm run db`, `docs/features/sqlite-foundation/implementation.md` | Local persistence exists for ideas, jobs, evidence, scores, reports, sources, and tool runs. |
| AI runner | `verified` | `src/ai/`, `prompts/`, `docs/features/ai-runner/implementation.md` | AI work is bounded by prompts, structured outputs, and local artifacts. |
| Codex skills | `verified` | `.codex/skills/micro-business-*`, `docs/features/codex-skills/implementation.md` | Local skills can run validation, autocomplete research, and report summarization. |
| External collectors | `verified` | `src/utilities/serp/`, `src/utilities/reddit/`, `src/utilities/youtube/`, `src/utilities/reviews/`, `src/utilities/competitors/`, `docs/features/external-collectors/implementation.md` | External evidence collection exists with local-first behavior and provider boundaries. |
| Web interface | `verified` | `src/web/`, `src/commands/web.ts`, `src/commands/worker.ts`, `npm run web`, `docs/features/web-interface/implementation.md` | Local HTTP interface supports idea submission, job status, evidence, reports, and settings. |
| Payment test and SEO outputs | `verified` | `src/payment-test.ts`, `src/seo-plan.ts`, `src/validation/payment-test-generator.ts`, `src/validation/seo-plan-generator.ts`, `docs/features/payment-test-and-seo/implementation.md` | Generates evidence-backed fake-door/payment-test and SEO planning artifacts. |
| Post-launch measurement | `verified` | `src/measurement/`, `src/commands/measurement.ts`, `npm run measurement`, `docs/features/post-launch-measurement/implementation.md` | Stores experiment events, aggregates metrics, and evaluates thresholds. |
| Pivot/persevere loop | `verified` | `src/decision-loop/`, `src/commands/decide.ts`, `npm run decide`, `docs/features/pivot-persevere-loop/implementation.md` | Converts measurement and evidence into decision memos and next experiments. |
| Idea portfolio | `verified` | `src/portfolio/`, `src/commands/portfolio.ts`, `docs/features/idea-portfolio/implementation.md` | Local portfolio comparison ranks ideas by evidence quality, risk, cost to test, and next action. |
| Scheduled revalidation | `verified` | `src/revalidation/`, `src/commands/revalidate.ts`, `npm run revalidate`, `docs/features/scheduled-revalidation/implementation.md` | Scheduled revalidation is implemented and verified. |
| Data export and backup | `verified` | `src/export/`, `src/commands/export-data.ts`, `src/commands/backup.ts`, `src/commands/restore.ts`, `docs/features/data-export-and-backup/implementation.md` | Local exports, backups, and restores work with manifest validation and optional redaction. |
| Operator diagnostics | `verified` | `src/diagnostics/`, `src/commands/diagnose.ts`, `npm run diagnose`, `docs/features/operator-diagnostics/implementation.md` | Local diagnostics cover config, DB, jobs, collectors, commands, reports, and artifacts. |
| Release packaging | `verified` | `scripts/package-local.ts`, `scripts/release-check.ts`, `npm run package:local`, `npm run release:check`, `docs/features/release-packaging/implementation.md` | Local package and release checks exist. |
| Workflow recipes | `verified` | `docs/recipes/README.md`, `docs/recipes/`, `scripts/check-recipes.ts`, `docs/features/workflow-recipes/implementation.md` | Common operating flows are documented and checked. |
| Quality hardening | `verified` | migration, command-doc, release, and fixture tests; `docs/features/quality-hardening/implementation.md` | Regression coverage and deterministic checks were expanded. |
| Roadmap governance | `verified` | `docs/governance/roadmap-governance.md`, `scripts/check-roadmap.ts`, `npm run roadmap:check`, `docs/features/roadmap-governance/implementation.md` | Phase status rules and roadmap checks exist. |
| Backlog prioritization | `verified` | `docs/governance/backlog-prioritization.md`, `docs/governance/templates/backlog-item.md`, `scripts/check-backlog.ts`, `npm run backlog:check`, `docs/features/backlog-prioritization/implementation.md` | Future work can be scored before planning or implementation. |
| ChatGPT autocomplete bridge | `verified` | `extension/`, `src/autocomplete-bridge/`, `src/commands/autocomplete-api.ts`, `ecosystem.config.cjs`, `docs/features/chatgpt-autocomplete-bridge/implementation.md` | Private Chrome extension submits strict data-only requests to a token-authenticated sequential backend and returns cached Markdown reports. |

## Commands Present

The current command surface in `package.json` includes:

- `npm run autocomplete`
- `npm run autocomplete:api`
- `npm run autocomplete:user`
- `npm run autocomplete:pm2`
- `npm run db`
- `npm run validate`
- `npm run report`
- `npm run payment-test`
- `npm run seo-plan`
- `npm run measurement`
- `npm run decide`
- `npm run revalidate`
- `npm run portfolio`
- `npm run export-data`
- `npm run backup`
- `npm run restore`
- `npm run diagnose`
- `npm run web`
- `npm run worker`
- `npm run package:local`
- `npm run release:check`
- `npm run roadmap:check`
- `npm run backlog:check`

## Main Gaps

- `idea portfolio` is implemented as a local CLI comparison workflow.
- `data export and backup` is implemented but still needs broader release/doc verification.
- Some diagnostics and release checks may still need explicit verification for the new export/backup command surface.
- Generated `results/`, `artifacts/`, `exports/`, `backups/`, and SQLite files are ignored and should not be treated as source documentation.
