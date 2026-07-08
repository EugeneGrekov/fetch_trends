# Codex Skills Plan

## Goal

After the AI runner is implemented, add project-local Codex skills that let Codex invoke the local validation pipeline naturally from a prompt.

The skills should be thin agent-facing wrappers around stable local commands and stored reports. They should not replace the CLI, SQLite store, validation orchestrator, or AI runner.

Core rule:

```text
Skills call tools.
Tools store evidence.
Reports explain evidence.
Codex summarizes results.
```

## Prerequisite

Complete and verify:

```text
docs/features/ai-runner/plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- Autocomplete as a utility under `src/utilities/autocomplete/`.
- SQLite persistence.
- A minimal `validate` command.
- Stored ideas, jobs, tool runs, predictions, scores, and reports.
- AI runner with bounded Codex execution.
- Deterministic fallback when AI is unavailable.

## Non-Goals

Do not add these in this phase:

- Web UI.
- External SERP/Reddit/YouTube collectors.
- Payment-test landing page generation.
- Search Console integration.
- Multi-user job queue.
- Global skill installation.

This phase only adds project-local Codex skills for operating the existing local pipeline.

## Target Skill Layout

Create:

```text
.codex/
  skills/
    micro-business-autocomplete/
      SKILL.md
    micro-business-validate/
      SKILL.md
    micro-business-report/
      SKILL.md
```

Optional later:

```text
.codex/
  skills/
    micro-business-compare/
      SKILL.md
    micro-business-payment-test/
      SKILL.md
```

Start with three skills only.

## Skill Responsibilities

| Skill | Responsibility |
|---|---|
| `micro-business-autocomplete` | Run autocomplete research for seed phrases and summarize query-language evidence. |
| `micro-business-validate` | Run the local validation pipeline for a rough idea and summarize verdict, scores, and missing proof. |
| `micro-business-report` | Read stored reports/evidence for an idea or job and produce a concise discussion-ready summary. |

## Skill Boundaries

Skills should:

- Read project docs before acting when needed.
- Run local CLI commands.
- Read generated report files or SQLite-backed outputs.
- Explain evidence and missing proof.
- Clearly distinguish facts from assumptions.
- Respect the micro-business validation model.

Skills should not:

- Invent evidence.
- Browse the web unless the underlying local command does it.
- Mutate source code.
- Modify database rows manually.
- Rewrite reports unless explicitly asked.
- Bypass the validation pipeline.

## Skill 1: `micro-business-autocomplete`

### Trigger

Use when the user asks Codex to:

- Run autocomplete research.
- Find search-language evidence.
- Expand seed phrases.
- Inspect autocomplete output.
- Identify high-intent/problem-intent queries.

### Expected Commands

Typical command:

```bash
npm run autocomplete -- --seed "<seed>" --country US --language en --depth 1 --out ./results/<slug>.csv
```

Batch command:

```bash
npm run autocomplete -- --seeds <path> --country US --language en --depth 1 --out ./results/<slug>.csv
```

Depth 2 only when useful:

```bash
npm run autocomplete -- --seed "<seed>" --depth 2 --maxDepth2Prefixes 100 --out ./results/<slug>.csv
```

### Output Summary

The skill should report:

- Output files.
- Total predictions.
- Unique normalized predictions.
- Top high-intent queries.
- Top problem-intent queries.
- Weak or low-intent queries to avoid.
- Recommended next validation action.

### Guardrails

- Say autocomplete validates wording, not volume.
- Do not claim monthly demand.
- Warn if Google blocks or CAPTCHA appears.
- Do not bypass anti-bot systems.

## Skill 2: `micro-business-validate`

### Trigger

Use when the user asks Codex to:

- Validate a micro-business idea.
- Score an idea.
- Decide whether an idea should be built, validated deeper, or killed.
- Run the full local validation pipeline.

### Expected Command

Typical command:

```bash
npm run validate -- --idea "<idea>" --country US
```

With AI disabled:

```bash
npm run validate -- --idea "<idea>" --country US --ai false
```

With explicit output/report behavior if supported:

```bash
npm run validate -- --idea "<idea>" --country US --report markdown
```

### Output Summary

The skill should report:

- Idea ID.
- Job ID.
- Report path or report ID.
- Verdict.
- 30-point guide score.
- 100-point pipeline score if available.
- Triggered kill rules.
- Strongest evidence.
- Weakest evidence.
- Missing proof.
- Single next validation action.

### Guardrails

- Never say “validated” unless real payment evidence exists.
- Prefer “automated validation passed” or “enough evidence for a payment test.”
- If only autocomplete evidence exists, say search-language-only evidence.
- If AI fallback was used, say so.

## Skill 3: `micro-business-report`

### Trigger

Use when the user asks Codex to:

- Summarize a prior validation.
- Review an idea report.
- Compare evidence from a stored job.
- Prepare discussion notes from a validation report.

### Expected Commands

By idea:

```bash
npm run report -- --idea-id <id> --format markdown
```

By job:

```bash
npm run report -- --job-id <id> --format markdown
```

If no report command exists yet, the skill may read the stored Markdown artifact or use the DB inspection command introduced in the SQLite phase.

### Output Summary

The skill should produce:

- Short verdict.
- Evidence-backed reason.
- Top 3 risks.
- Top 3 missing proofs.
- Best next action.

### Guardrails

- Do not expand into a new validation unless asked.
- Do not change stored reports.
- Cite the local report path or DB IDs used.

## Skill File Requirements

Each `SKILL.md` should include:

- Description and triggers.
- Required project context.
- Commands to run.
- Expected outputs to inspect.
- Summary format.
- Guardrails.
- Failure handling.

Each skill should be concise enough for Codex to load quickly.

## Shared Skill Instructions

All skills should include these shared principles:

```text
This project validates one-time-payment micro-business ideas.
Do not treat AI interpretation as proof.
Prefer local stored evidence over opinion.
Autocomplete is search-language evidence, not demand volume.
Final decisions must mention missing proof.
Only real payment validates willingness to pay.
```

## Failure Handling

Skills should handle:

| Failure | Behavior |
|---|---|
| CLI command missing | Tell user which command is unavailable and stop. |
| Build/test failure | Report the failing command and first relevant error. |
| Codex unavailable inside pipeline | Continue with deterministic fallback if command supports it. |
| No report found | Ask user for idea/job ID or run report command if available. |
| CAPTCHA/blocking | Report safe stop and do not bypass. |
| Empty evidence | Mark validation inconclusive. |

## Testing Plan

Manual skill tests are acceptable for this phase.

Test cases:

1. Ask Codex to run autocomplete on one seed.
2. Ask Codex to validate one rough idea.
3. Ask Codex to summarize a stored report.
4. Run validation with `--ai false`.
5. Simulate missing report or invalid idea ID.

Expected behavior:

- Skill chooses the right command.
- Skill does not invent missing evidence.
- Skill reports file paths or IDs.
- Skill gives one next action.

## Documentation Updates

Update:

```text
README.md
docs/reference/architecture.md
```

README should explain:

- How to run the CLI directly.
- How to use Codex skills from this repo.
- What each skill is for.
- What the skills do not prove.

Architecture doc should note:

- Skills sit above the CLI/orchestrator.
- Skills are not part of core validation logic.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

Then run at least one manual Codex skill workflow.

Do not require live Google smoke tests in default verification.

## Acceptance Criteria

- Three project-local skills exist.
- Skills call local commands rather than reimplementing logic.
- Skills summarize stored outputs and reports.
- Skills distinguish evidence, inference, assumption, and missing proof.
- Skills do not introduce web UI or external collectors.
- Existing CLI behavior remains unchanged.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Skills may become too broad and duplicate the pipeline.
- Codex may summarize too confidently.
- Local command output may not include enough machine-readable IDs.
- Users may think a skill verdict equals business validation.

Mitigations:

- Keep skill instructions narrow.
- Always require report paths or DB IDs.
- Include explicit “not proof of payment” wording.
- Prefer one next action instead of a long generic plan.

## Recommended Next Phase

After project-local Codex skills work, add stronger external evidence collectors:

```text
docs/features/external-collectors/plan.md
```

Initial collectors:

- SERP provider adapter.
- Reddit/forum collector.
- YouTube search collector.
- Competitor page collector.
- Review mining adapter where feasible.

These collectors should feed SQLite evidence tables and improve the report beyond autocomplete-only validation.
