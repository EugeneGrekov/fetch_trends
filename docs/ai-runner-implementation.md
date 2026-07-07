# AI Runner Implementation

This document describes the code landed for [docs/ai-runner-plan.md](./ai-runner-plan.md).

## What was added

- `src/ai/runner.ts`
  - Public local AI runner that wraps prompt loading, safe Codex execution, JSON parsing, artifact writing, and `tool_runs` persistence.
- `src/ai/codex-runner.ts`
  - Executes `codex exec` in an ephemeral read-only directory with `default_tools_enabled=false`.
- `src/ai/prompt-loader.ts`
  - Loads prompt templates from `prompts/`.
- `src/ai/json-output.ts`
  - Accepts raw JSON or one fenced JSON block and throws clear errors on empty or invalid output.
- `src/ai/types.ts`
  - Shared task, payload, and metadata types.
- `prompts/*.md`
  - Strict prompt templates for idea normalization, query generation, evidence summary, score explanation, and final report drafting.

## Validation integration

`src/validation/orchestrator.ts` now runs this bounded sequence:

1. Create the idea and job rows deterministically.
2. Attempt AI idea normalization.
3. Attempt AI query generation.
4. Run autocomplete collection and persist evidence.
5. Compute the deterministic score.
6. Attempt AI evidence summary.
7. Attempt AI final report drafting.
8. Persist the final report.

Fallback behavior is explicit:

- If Codex is unavailable, AI runs are stored as `blocked` in `tool_runs` and validation continues deterministically.
- If Codex returns malformed JSON or exits non-zero, the AI run is stored as `failed` and validation continues deterministically.
- If AI succeeds, parsed JSON is stored in `tool_runs.output_json` and raw output remains in `artifacts/ai-runs/`.

## New CLI surface

`npm run validate -- ...` now supports:

- `--ai true|false`
- `--ai-model <model>`
- `--ai-reasoning <effort>`
- `--keep-ai-artifacts true|false`

Defaults:

- `--ai true`
- `--keep-ai-artifacts true`

## Storage and artifacts

- AI task names persisted to `tool_runs.tool_name`
  - `ai.idea_normalize`
  - `ai.query_generate`
  - `ai.evidence_summarize`
  - `ai.final_report`
- Artifact root
  - `artifacts/ai-runs/job-<job-id>/`
- Stored files per task run
  - `<task>-run-<tool-run-id>.input.json`
  - `<task>-run-<tool-run-id>.prompt.txt`
  - `<task>-run-<tool-run-id>.output.txt`
  - `<task>-run-<tool-run-id>.metadata.json`

## Notes

- Query generation is intentionally bounded to 12 queries in the validate pipeline so autocomplete collection stays local and tractable.
- Deterministic evidence summaries and reports still exist, so the pipeline remains usable without Codex.
