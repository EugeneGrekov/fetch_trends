# AI Runner Plan

## Goal

After the SQLite foundation is implemented, add a bounded AI runner that uses Codex to analyze stored evidence and produce structured outputs.

The AI runner should not collect evidence directly and should not be treated as proof. It should consume local evidence from SQLite or generated JSON files, then write structured analysis, scores, and report drafts with metadata.

Core rule:

```text
Evidence first.
AI interpretation second.
Stored output and metadata always.
```

## Prerequisite

Complete and verify:

```text
docs/sqlite-foundation-plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- Creating ideas.
- Creating validation jobs.
- Running autocomplete through the utility boundary.
- Storing autocomplete evidence in SQLite.
- Storing a basic score.
- Storing a basic Markdown report.

## Non-Goals

Do not add these in this phase:

- Web UI.
- Codex skills.
- SERP/Reddit/YouTube collectors.
- Payment-test landing page generation.
- Search Console integration.
- Multi-user job queue.

This phase is only about the local AI execution layer and its first integration into validation.

## Design Principle

Codex should analyze prepared local payloads.

It should not:

- Browse the web.
- Mutate source files.
- Invent evidence.
- Write directly to SQLite.
- Replace deterministic scoring.

It should:

- Normalize rough ideas.
- Generate search-query hypotheses.
- Extract structured insights from stored evidence.
- Draft reports from evidence JSON.
- Return parseable JSON when requested.
- Save run metadata.

## Target Structure

Create:

```text
src/ai/
  runner.ts
  codex-runner.ts
  prompt-loader.ts
  json-output.ts
  types.ts

prompts/
  idea-normalize.md
  query-generate.md
  evidence-summarize.md
  score-explain.md
  final-report.md
```

Optional later:

```text
config/
  ai-routes.json
```

Keep this phase simple. A single Codex configuration is enough at first.

## AI Runner Responsibilities

| Module | Responsibility |
|---|---|
| `runner.ts` | Public AI task runner interface. |
| `codex-runner.ts` | Executes `codex exec` with safe defaults. |
| `prompt-loader.ts` | Loads prompt templates from `prompts/`. |
| `json-output.ts` | Parses and validates model JSON output. |
| `types.ts` | Shared AI task, result, and metadata types. |

## Safe Codex Execution

Use an isolated directory and read-only Codex execution.

Baseline command pattern:

```bash
codex exec \
  --skip-git-repo-check \
  --ephemeral \
  -s read-only \
  -C "$ISOLATION_DIR" \
  -c default_tools_enabled=false \
  -o "$OUTPUT_PATH" \
  -
```

Rules:

- Write the model input prompt to a temp file.
- Pipe the prompt into Codex.
- Capture raw output to a temp file.
- Move output atomically into the run artifact path.
- Store run metadata in `tool_runs`.
- Store failures in `tool_runs.error_message`.

## AI Task Types

Start with four AI tasks.

### 1. Idea Normalization

Input:

```json
{
  "rawIdea": "automatic app that saves parking location when Bluetooth disconnects",
  "targetMarket": "US",
  "expectedPrice": "$19",
  "platform": "iPhone and Android"
}
```

Output:

```json
{
  "title": "Automatic parked car location saver",
  "user": "drivers who forget where they parked",
  "pain": "forgot where I parked",
  "trigger": "leaving the car",
  "current_workarounds": ["manual pin", "photo", "Apple Maps parked car", "AirTag"],
  "desired_result": "find the car without remembering to save the location",
  "business_model": "one-time payment",
  "price_range": "$5-$30",
  "category": "mobile utility",
  "assumptions": [
    "Bluetooth disconnect can be detected reliably",
    "users trust location permissions"
  ]
}
```

### 2. Query Generation

Input:

```json
{
  "normalizedIdea": {},
  "targetMarket": "US",
  "queryCount": 100
}
```

Output:

```json
{
  "queries": [
    {
      "query": "automatically save parking location app",
      "intent": "automatic solution",
      "priority": 9,
      "reason": "Specific task phrase with app and automation intent."
    }
  ]
}
```

Query groups:

- Pain.
- Solution.
- Automatic solution.
- Workaround.
- Competitor.
- Payment proxy.
- Community pain.
- Low intent to avoid.

### 3. Evidence Summary

Input:

```json
{
  "idea": {},
  "autocompletePredictions": [],
  "scores": []
}
```

Output:

```json
{
  "facts": [],
  "inferences": [],
  "assumptions": [],
  "missingProof": [],
  "redFlags": []
}
```

This task must distinguish evidence from interpretation.

### 4. Final Report Draft

Input:

```json
{
  "idea": {},
  "evidenceSummary": {},
  "scores": {},
  "autocompletePredictions": []
}
```

Output:

```json
{
  "verdict": "VALIDATE DEEPER",
  "markdown": "# Validation Report\n...",
  "nextAction": "Collect SERP and Reddit evidence for the top 20 high-intent queries."
}
```

The report must say when evidence is incomplete.

## Prompt Requirements

Each prompt should:

- Be strict.
- Require JSON when the task expects JSON.
- Say not to invent evidence.
- Require missing evidence to be labeled as missing.
- Use US market by default unless input says otherwise.
- Follow the micro-business validation model.
- Preserve one-time-payment assumptions.

Prompt files:

```text
prompts/idea-normalize.md
prompts/query-generate.md
prompts/evidence-summarize.md
prompts/score-explain.md
prompts/final-report.md
```

## JSON Output Handling

Add a parser that:

- Accepts raw JSON.
- Accepts JSON inside a single Markdown code fence.
- Rejects empty output.
- Rejects invalid JSON.
- Returns clear error messages.

Do not silently repair deeply malformed JSON in this phase.

Store:

- Raw output.
- Parsed output if valid.
- Parse error if invalid.

## Persistence Integration

Every AI call should create a `tool_runs` row.

`tool_runs.tool_name` examples:

```text
ai.idea_normalize
ai.query_generate
ai.evidence_summarize
ai.final_report
```

Store:

| Field | Content |
|---|---|
| `input_json` | Exact task payload. |
| `output_json` | Parsed JSON output when available. |
| `metadata_json` | Model, command, duration, artifact paths, token info if available. |
| `status` | `completed`, `failed`, or `blocked`. |
| `error_message` | Codex error or JSON parse error. |

Reports should still be inserted into `reports`, not only stored in `tool_runs`.

## Validate Command Integration

Enhance the minimal `validate` command:

```text
input idea
  -> AI idea normalization
  -> AI query generation
  -> autocomplete utility
  -> deterministic score
  -> AI evidence summary
  -> AI final report draft
  -> stored report
```

Fallback behavior:

- If Codex is unavailable, run deterministic validation only.
- If idea normalization fails, use raw idea as title/description.
- If query generation fails, use deterministic seed generation.
- If final report fails, generate deterministic basic report.

The pipeline should degrade gracefully.

## CLI Options

Add options to `validate`:

```text
--ai true|false
--ai-model <model>
--ai-reasoning <effort>
--keep-ai-artifacts true|false
```

Defaults:

```text
--ai true
--keep-ai-artifacts true
```

If Codex is unavailable, print a warning and continue without AI.

## Artifact Paths

Store AI artifacts outside `dist/`.

Recommended:

```text
artifacts/
  ai-runs/
    <job-id>/
      idea-normalize.input.json
      idea-normalize.prompt.txt
      idea-normalize.output.txt
      idea-normalize.metadata.json
```

Do not commit generated artifacts unless explicitly requested.

## Tests

Add tests for:

- Prompt loading.
- JSON extraction from raw JSON.
- JSON extraction from fenced JSON.
- Invalid JSON failure.
- AI runner using a fake executor.
- Tool run persistence for successful AI call.
- Tool run persistence for failed AI call.
- `validate` fallback when AI fails.

Do not call live Codex in default tests.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

Optional manual smoke test if Codex CLI is available:

```bash
npm run validate -- --idea "automatic app that saves parking location when Bluetooth disconnects" --ai true
```

## Acceptance Criteria

- AI prompt templates exist.
- Codex runner exists with safe read-only execution defaults.
- JSON output parser exists and is tested.
- AI calls are stored in `tool_runs`.
- `validate` can run with AI enabled.
- `validate` can fall back when AI is unavailable or invalid.
- Reports still separate facts, inferences, assumptions, and missing proof.
- No external collectors or web UI are introduced.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- AI may produce plausible but unsupported claims.
- JSON output may be malformed.
- Codex CLI may not be installed or authenticated.
- Prompt payloads may grow too large.
- The AI layer may blur evidence and interpretation if prompts are too loose.

Mitigations:

- Keep prompts strict.
- Store raw evidence separately.
- Store raw AI output and parsed JSON separately.
- Require fallback deterministic reports.
- Keep default tests fake and deterministic.

## Recommended Next Phase

After the AI runner works, add project-local Codex skills:

```text
.codex/skills/micro-business-autocomplete/
.codex/skills/micro-business-validate/
.codex/skills/micro-business-report/
```

The skills should call local CLI commands and read stored reports. They should not replace the pipeline.
