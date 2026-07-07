# Workflow Recipes Plan

## Goal

After release packaging exists, add user-facing workflow recipes that document common end-to-end ways to use the local validation system.

This phase should make the tool easier to operate without remembering every command, table, report type, and phase-specific output.

Core rule:

```text
Recipes should show practical paths from user intent to verified output.
They should not introduce new validation logic.
```

## Prerequisite

Complete and verify:

```text
docs/release-packaging-plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- CLI installation and release checks.
- Local web UI.
- Validation pipeline.
- Evidence collectors.
- Payment-test and SEO output generation.
- Measurement and decision workflows.
- Portfolio ranking.
- Revalidation.
- Diagnostics.
- Export and backup.

## Non-Goals

Do not add these in this phase:

- New CLI features.
- New database tables.
- New validation scoring logic.
- New external collectors.
- Web UI redesign.
- Cloud deployment.

This phase is documentation and recipe verification only.

## Target Structure

Create:

```text
docs/recipes/
  validate-one-idea.md
  compare-idea-portfolio.md
  run-payment-test.md
  measure-experiment.md
  decide-pivot-or-persevere.md
  revalidate-stale-evidence.md
  backup-and-restore.md
  diagnose-local-setup.md

docs/workflows.md
```

Optional:

```text
scripts/check-recipes.ts
```

## Implementation Steps

### Step 1: Define Recipe Format

Every recipe should use the same structure:

```text
# <Recipe Name>

## When To Use
User situation this recipe solves.

## Prerequisites
Required completed setup or existing data.

## Commands
Exact commands to run.

## Expected Outputs
Files, DB rows, reports, or UI pages produced.

## How To Read The Result
What the output means and what it does not prove.

## Failure Handling
Common failures and next actions.

## Next Step
One recommended next workflow.
```

### Step 2: Add Core Recipes

Add these recipes:

| Recipe | Purpose |
|---|---|
| `validate-one-idea.md` | Start with a rough idea and produce a validation report. |
| `compare-idea-portfolio.md` | Rank several ideas by evidence and next action. |
| `run-payment-test.md` | Generate payment-test and SEO artifacts from an evidence-backed report. |
| `measure-experiment.md` | Import/record post-launch behavior and evaluate thresholds. |
| `decide-pivot-or-persevere.md` | Turn measurement into a build/pivot/kill decision. |
| `revalidate-stale-evidence.md` | Refresh old evidence and reports. |
| `backup-and-restore.md` | Back up and restore local data. |
| `diagnose-local-setup.md` | Inspect setup, DB health, jobs, collectors, and artifacts. |

### Step 3: Add Workflow Index

Create:

```text
docs/workflows.md
```

It should list:

- The recipes.
- When to use each.
- Expected command sequence.
- Which outputs prove success.

### Step 4: Validate Command References

If practical, add a script that checks recipe command names against `package.json` scripts.

It should catch stale recipe commands but should not run live external services.

Optional:

```bash
npm run recipes:check
```

### Step 5: Link Docs

Update:

- `README.md`
- `docs/install.md` if it exists.
- `docs/commands.md` if it exists.

Add links to `docs/workflows.md`.

## Data / API / CLI Contracts

This phase should not add new runtime contracts.

Recipes should reference existing commands only.

Examples:

```bash
npm run validate -- --idea "..."
npm run payment-test -- --idea-id <id>
npm run seo-plan -- --idea-id <id>
npm run measurement -- --experiment-id <id> --events ./data/events.csv
npm run decide -- --idea-id <id>
npm run portfolio
npm run revalidate -- --scan
npm run diagnose
npm run backup -- --out ./backups
```

## Testing Plan

Add tests or checks for:

- Recipe files exist.
- Recipe files include required headings.
- Commands referenced in recipes exist in `package.json`.
- `docs/workflows.md` links to every recipe.

Default checks must not run live commands that call:

- Google.
- SERP providers.
- Reddit/YouTube APIs.
- Live Codex.
- Payment providers.
- Network.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

Optional if implemented:

```bash
npm run recipes:check
```

## Acceptance Criteria

- `docs/workflows.md` exists.
- Core recipe docs exist.
- Recipes use a consistent format.
- Recipes reference existing commands.
- README or install docs link to workflow docs.
- Optional recipe checker passes if implemented.
- No new validation logic is introduced.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Recipes can drift from actual commands.
- Recipes can become too verbose.
- Users may treat proxy workflow outputs as proof.
- Documentation can duplicate command reference docs.

Mitigations:

- Check commands against `package.json`.
- Keep recipes task-oriented.
- Include “what this does not prove” in every recipe.
- Link to command reference instead of duplicating every option.

## Recommended Next Phase

After workflow recipes exist, add long-term maintenance and quality hardening:

```text
docs/quality-hardening-plan.md
```

That phase should focus on regression coverage, fixture stability, migration compatibility, command consistency, and cleanup of accumulated technical debt.
