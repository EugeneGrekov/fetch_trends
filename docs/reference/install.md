# Install

## Requirements

- Node.js 20 or newer.
- npm.
- A local shell that can run `npm` scripts.
- Chromium for Playwright-powered autocomplete collection.
- Google Chrome 120 or newer for the private Manifest V3 extension.

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

## Start The ChatGPT Autocomplete Bridge

Create the first local user. The password is entered twice without echo and is
stored only as a salted hash:

```bash
npm run autocomplete:user -- add --username egrekov
```

Build and start the API under PM2:

```bash
npm run autocomplete:pm2
pm2 startup
pm2 save
```

Run the platform-specific command printed by `pm2 startup`, then run `pm2 save`
again. That enables restoration after a machine restart.

The default API address is `http://127.0.0.1:3099`. Useful PM2 checks:

```bash
pm2 status fetch-trends-autocomplete-api
pm2 logs fetch-trends-autocomplete-api
pm2 restart fetch-trends-autocomplete-api
```

Load the extension:

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked** and choose the repository's `extension/` directory.
4. Pin the extension.
5. In the connection window, enter `http://127.0.0.1:3099`, the local username,
   and the password once.
6. Select Automatic or Semi-automatic mode after the connection succeeds.

The extension saves only the returned token. It does not save the password.
The authentication file `config/autocomplete-users.json` and SQLite database
are local generated files and are excluded from Git.

## Build A Local Package Directory

After building:

```bash
npm run package:local -- --out ./dist-package/fetch-trends
```

The local package directory includes runtime code, the private extension, PM2
configuration, docs, prompts, nonsecret config, and local Codex skills. It
intentionally excludes generated/local data such as authentication credentials,
SQLite databases, results, artifacts, backups, exports, logs, `.env` files, and
resume files.
