# Quality Hardening Plan

## Goal

After workflow recipes exist, harden the system by improving regression coverage, fixture stability, migration compatibility, command consistency, and technical-debt cleanup.

This phase should reduce breakage risk after many feature slices have been added in parallel.

Core rule:

```text
Hardening should make existing behavior safer.
It should not add new product surface area.
```

## Prerequisite

Complete and verify:

```text
docs/workflow-recipes-plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- CLI workflows.
- Web UI.
- SQLite migrations.
- External collectors.
- AI runner.
- Measurement and decision workflows.
- Revalidation.
- Diagnostics.
- Release checks.
- Workflow recipes.

## Non-Goals

Do not add these in this phase:

- New validation features.
- New collectors.
- New web pages except test/diagnostic cleanup if necessary.
- New database product tables unless required for compatibility tests.
- Cloud deployment.
- Performance rewrites.
- UI redesign.

This phase is regression and maintainability work.

## Target Structure

Create or update:

```text
src/testing/
  fixtures.ts
  temp-db.ts
  fake-collectors.ts
  fake-ai.ts

docs/
  quality-hardening-implementation.md
```

Optional:

```text
scripts/
  check-command-docs.ts
  check-migrations.ts
```

## Implementation Steps

### Step 1: Audit Test Coverage

Identify important command and service paths with weak coverage.

Prioritize:

- Migration ordering and idempotence.
- CLI command parsing.
- Report persistence.
- Artifact output paths.
- No-live-network test guarantees.
- Fallback paths for missing AI/API keys.

### Step 2: Stabilize Fixtures

Add shared fixtures for:

- Ideas.
- Reports.
- Scores.
- Sources/evidence.
- Experiments/events.
- Decisions.
- Portfolio rows.
- Revalidation rows.

Fixtures should be small, deterministic, and reusable.

### Step 3: Harden Migration Tests

Verify:

- Fresh DB migration.
- Re-running migrations is idempotent.
- Required tables exist.
- Expected migration count or latest migration is correct.
- Repository tests work from migrated schema.

Avoid brittle tests that break only because a new migration was added. Prefer checking latest migration identity or minimum expected tables.

### Step 4: Check Command Consistency

Audit `package.json` scripts against:

- `docs/commands.md` if it exists.
- Workflow recipes.
- README examples.
- CLI entrypoint files.

Add a check script if practical.

### Step 5: Enforce Offline Tests

Make sure default tests do not call:

- Google.
- SERP providers.
- Reddit/YouTube APIs.
- Live Codex.
- Payment providers.
- Search Console.
- Network.

Use fake collectors and fake AI runner in integration tests.

### Step 6: Clean Technical Debt

Look for:

- Duplicate type definitions.
- Inconsistent report type names.
- Inconsistent command output formats.
- Repeated test setup code.
- Dead files from previous refactors.
- TODOs that block reliability.

Only fix debt that is safe and related to reliability.

### Step 7: Add Quality Hardening Note

Document:

- What was hardened.
- Tests added.
- Fragile areas that remain.
- Known skipped cleanup.
- Verification results.

## Data / API / CLI Contracts

This phase should preserve existing public contracts.

Allowed changes:

- Add test utilities.
- Add check scripts.
- Improve docs consistency.
- Make command output more consistent only if backward compatible.

Disallowed changes:

- Rename existing commands.
- Change report schemas incompatibly.
- Delete migrations.
- Require live services for default tests.

## Testing Plan

Add or improve tests for:

- Migration idempotence.
- Repository compatibility after all migrations.
- CLI command entrypoints.
- Command docs/recipe consistency.
- Report generation fixtures.
- Artifact path safety.
- Missing env/API key fallback.
- Diagnostics/release checks if present.

Default tests must not call:

- Live external APIs.
- Live Codex.
- Network.
- Payment providers.

## Verification

Run:

```bash
npm test
npm run build
npm run lint
```

If available:

```bash
npm run release:check
npm run recipes:check
```

## Acceptance Criteria

- Shared test utilities or fixtures exist where useful.
- Migration tests are stable across added migrations.
- Command docs/recipes are consistent with `package.json` scripts where practical.
- Default tests are offline.
- Known fragile areas are documented.
- No product behavior is intentionally changed.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Hardening can turn into broad refactoring.
- Tests can become too coupled to implementation details.
- Command consistency checks can be brittle.
- Fixing unrelated debt can conflict with ongoing feature branches.

Mitigations:

- Keep scope reliability-focused.
- Prefer public behavior tests.
- Avoid changing command names.
- Document deferred cleanup instead of expanding scope.

## Recommended Next Phase

After quality hardening, create a roadmap governance and maintenance plan:

```text
docs/roadmap-governance-plan.md
```

That phase should define how future phases are proposed, prioritized, implemented, verified, documented, and retired.
