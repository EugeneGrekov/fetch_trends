# Release Packaging Plan

## Goal

After operator diagnostics exist, add release packaging so the local CLI, web app, Codex skills, docs, migrations, and verification commands are easier to install, run, verify, and distribute.

This phase should turn the growing local toolkit into a predictable local product.

Core rule:

```text
If the tool is hard to install or verify, the validation system itself becomes unreliable.
```

## Prerequisite

Complete and verify:

```text
docs/features/operator-diagnostics/plan.md
```

Required checks before starting this phase:

```bash
npm test
npm run build
npm run lint
```

The project should already support:

- CLI commands.
- Local web app.
- SQLite migrations.
- Codex skills.
- Diagnostics.
- Export/backup.
- Documentation for major phases.

Release verification should treat `portfolio`, `export-data`, `backup`, and `restore` as part of the command surface as soon as they appear in `package.json`.

## Non-Goals

Do not add these in this phase:

- Cloud deployment.
- Hosted SaaS.
- Real payment processing.
- Auto-update service.
- Native desktop packaging.
- Docker publishing unless explicitly chosen.
- Global Codex skill marketplace publishing.

This phase is local release packaging and verification.

## Target Structure

Create or update:

```text
scripts/
  release-check.ts
  package-local.ts

docs/
  reference/install.md
  reference/commands.md
  reference/release-checklist.md

config/
  example.env
```

Optional:

```text
dist-package/
```

Do not commit generated distribution archives unless explicitly requested.

## Implementation Steps

### Step 1: Audit Commands

Ensure core commands are documented and consistently exposed through `package.json`.

Expected command groups:

- Research: `autocomplete`, `validate`.
- Evidence and reports: `report`, `payment-test`, `seo-plan`.
- Measurement and decisions: `measurement`, `decide`, `portfolio`.
- Maintenance: `revalidate`, `diagnose`, `export-data`, `backup`, `restore`.
- App: `web`, `worker`.
- Build/test: `test`, `build`, `lint`.

### Step 2: Add Install Documentation

Create:

```text
docs/reference/install.md
```

Cover:

- Node version.
- `npm install`.
- Playwright browser install if needed.
- SQLite DB path.
- Optional environment variables.
- Running migrations.
- Running diagnostics.
- Starting web UI.

### Step 3: Add Command Reference

Create:

```text
docs/reference/commands.md
```

For each command include:

- Purpose.
- Example.
- Inputs.
- Outputs.
- Whether it can call live external services.
- Whether it writes SQLite.

### Step 4: Add Example Environment File

Create:

```text
config/example.env
```

Include keys without values:

```text
FETCH_TRENDS_DB_PATH=
FETCH_TRENDS_RESULTS_DIR=
SERP_API_KEY=
YOUTUBE_API_KEY=
REDDIT_CLIENT_ID=
REDDIT_CLIENT_SECRET=
```

Do not include real secrets.

### Step 5: Add Release Check Script

Add a local release check command:

```bash
npm run release:check
```

It should run:

```bash
npm test
npm run build
npm run lint
npm run diagnose -- --json
```

If diagnostics depends on a DB, use a temp DB or a safe default.

### Step 6: Add Package Verification

Verify:

- `dist/` builds.
- Bin entrypoints exist.
- Core docs exist.
- Required skills exist.
- Migrations can run on a temp DB.
- No generated backup/export artifacts are accidentally included.

### Step 7: Optional Local Package Builder

Optional command:

```bash
npm run package:local
```

It can produce a local directory containing:

- `dist/`.
- `package.json`.
- `README.md`.
- `docs/`.
- `.codex/skills/`.
- `config/example.env`.

Do not overbuild this until install and release checks are stable.

## Data / API / CLI Contracts

### Release Check Command

```bash
npm run release:check
```

Expected output:

```text
Release check passed.
Tests: pass
Build: pass
Lint: pass
Diagnostics: pass/warn
```

### Install Docs

Minimum install flow:

```bash
npm install
npm run build
npm run db -- --migrate
npm run diagnose
npm run web
```

### Package Local Command

Optional:

```bash
npm run package:local -- --out ./dist-package
```

## Testing Plan

Add tests for:

- Release check script command assembly.
- Example env file contains no values.
- Command documentation includes all `package.json` scripts.
- Package manifest/bin path consistency.
- Local package builder excludes generated data if implemented.

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
npm run release:check
```

If `release:check` includes the first three commands, avoid duplicate work in CI later. For local implementation, run all explicitly.

## Acceptance Criteria

- Install docs exist.
- Command reference exists.
- Example env file exists and contains no secrets.
- Release check command exists.
- Release check validates tests, build, lint, and diagnostics.
- Package/bin paths are verified.
- Generated data is not included in packaging outputs.
- `npm test` passes.
- `npm run build` passes.
- `npm run lint` passes.

## Risks

- Release check can become slow.
- Command docs can drift from `package.json`.
- Example env can accidentally include secrets.
- Packaging can include local SQLite DBs or artifacts.
- Local package builder can distract from core product work.

Mitigations:

- Keep release check simple.
- Test docs against `package.json` script names.
- Use empty env values.
- Explicitly exclude `data/*.sqlite`, `artifacts/`, `backups/`, and `exports/`.
- Make package builder optional.

## Recommended Next Phase

After release packaging exists, add user-facing workflow recipes:

```text
docs/features/workflow-recipes/plan.md
```

That phase should document common end-to-end flows such as validating one idea, comparing a portfolio, running a payment test, revalidating stale evidence, and backing up local data.
