# Install

## Requirements

- Node.js 20 or newer.
- npm.
- A local shell that can run `npm` scripts.
- Chromium for Playwright-powered autocomplete collection.

This is a local-first tool. It does not require hosted infrastructure for the default SQLite, CLI, or web UI flows.

## Install Dependencies

```bash
npm install
```

If Chromium is not already installed for Playwright:

```bash
npx playwright install chromium
```

## Configure Local Environment

Copy the example environment file only if you want local overrides:

```bash
cp config/example.env .env
```

Supported local path settings:

- `FETCH_TRENDS_DB_PATH`: SQLite database path. Defaults to `./data/fetch-trends.sqlite`.
- `FETCH_TRENDS_RESULTS_DIR`: default results directory for tools that read it.
- `FETCH_TRENDS_ARTIFACTS_DIR`: default artifacts directory for diagnostics and generated files.
- `FETCH_TRENDS_WEB_AI`: set to `true` to default web-triggered jobs to AI-enabled mode.

Optional collector credentials:

- `SERP_API_KEY`: enables the implemented SERP-backed external collector path.
- `YOUTUBE_API_KEY`: reserved for provider-backed YouTube collection.
- `REDDIT_CLIENT_ID`: reserved for provider-backed Reddit collection.
- `REDDIT_CLIENT_SECRET`: reserved for provider-backed Reddit collection.

Keep real secrets in `.env` or your shell environment. Do not commit filled env files.

## Build

```bash
npm run build
```

The build emits JavaScript into `dist/`. Package bin entries point at files under `dist/`, so run the build before using package-style bin commands or `npm run package:local`.

## Prepare SQLite

Run migrations before relying on persisted validation data:

```bash
npm run db -- --migrate
```

The default DB path is `./data/fetch-trends.sqlite`. Override it per command:

```bash
npm run db -- --migrate --db ./tmp/fetch-trends.sqlite
```

Or with an environment variable:

```bash
FETCH_TRENDS_DB_PATH=./tmp/fetch-trends.sqlite npm run db -- --migrate
```

## Verify The Install

Run the full local release check:

```bash
npm run release:check
```

This runs tests, build, lint, a temp SQLite migration check, diagnostics when available, and package/bin/documentation verification. If a `diagnose` npm script is present, it is run with a migrated temp DB and `--json`; otherwise release check reports diagnostics as a warning and continues with safe local package verification.

You can also run diagnostics directly when the command is present:

```bash
npm run diagnose -- --json
```

## Start The Web UI

```bash
npm run web
```

Defaults:

- Host: `127.0.0.1`
- Port: `3000`
- Database: `./data/fetch-trends.sqlite`
- Web job artifacts: `./results/web`
- AI for web-triggered jobs: disabled unless `--ai true` or `FETCH_TRENDS_WEB_AI=true`

Example:

```bash
npm run web -- --port 3010 --db ./data/fetch-trends.sqlite --ai false
```

## Build A Local Package Directory

After building:

```bash
npm run package:local -- --out ./dist-package/fetch-trends
```

The local package directory includes runtime code, docs, prompts, nonsecret config, and local Codex skills. It intentionally excludes generated/local data such as SQLite databases, results, artifacts, backups, exports, logs, `.env` files, and resume files.
