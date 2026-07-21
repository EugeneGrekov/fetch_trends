# ChatGPT Autocomplete Bridge Implementation

## Summary

Implemented the private Chrome extension and local authenticated API described
in the feature plan. The extension detects strict data-only autocomplete
requests in new ChatGPT assistant responses, submits them to a durable
single-worker queue, follows the job with 30-second long polling, and returns
the existing Markdown report according to the global automatic or
semi-automatic mode.

## Files And Modules Added Or Changed

- `extension/` contains the Manifest V3 extension, request parser, service
  worker, ChatGPT content script, in-page configuration and job drawer,
  toolbar icon, and installation README.
- `src/autocomplete-bridge/` contains request normalization, authentication,
  bridge-job persistence, sequential execution, the autocomplete runner
  adapter, HTTP API, and tests.
- `src/commands/autocomplete-api.ts` starts the API.
- `src/commands/autocomplete-user.ts` creates or replaces a local user through
  hidden password prompts.
- `ecosystem.config.cjs` runs one built API process under PM2.
- `config/autocomplete-users.example.json` documents the empty nonsecret auth
  configuration shape. The generated real file is ignored.
- `docs/reference/install.md`, `docs/reference/commands.md`,
  `docs/reference/architecture.md`, and directory READMEs document the new
  operating surface and module boundaries.
- Local release packaging now includes the extension, PM2 configuration, and
  nonsecret authentication example.

## Commands Added

```text
npm run autocomplete:api
npm run autocomplete:user -- add --username <name>
npm run autocomplete:pm2
```

Package bin entries were also added for the API and user-management commands.
PM2 is a development dependency so the repository-local command is available
after `npm install`.

## Schema And Migration Changes

Migration `006_chatgpt_autocomplete_bridge` adds
`autocomplete_bridge_jobs`. Each row stores:

- one order-independent canonical request key
- the first submitted seed and modifier presentation
- creator username
- queued, processing, completed, or failed status
- normal autocomplete output path
- exact result Markdown
- timestamps and failure details

The unique request key implements the forever cache. Seed and modifier order,
case, repeated whitespace, and duplicates do not change identity. A repeated
request returns the first stored job, including its first result.

## Authentication Behavior

- Passwords use a random salt and Node `scrypt` before they are written.
- Login returns a random 32-byte base64url token.
- The server stores only the SHA-256 token hash and replaces the previous token
  for that user on a later login.
- The extension stores only endpoint, username, token, mode, tab state, and
  recent job state. It discards the password after Connect.
- Disconnect removes the local extension token without adding a revocation API.
- Extension storage is restricted to trusted extension contexts.

## Extension Behavior Implemented

- Monitors every open `chatgpt.com` tab, including background tabs.
- Accepts the first recognizable fenced code block per new assistant response.
- Submits immediately when a strict valid JSON object first becomes complete,
  including during streaming.
- Uses the agreed dark gray, light gray, green, blue, yellow, orange, purple,
  and red toolbar states for the current page.
- Supports connected inactive, automatic, and semi-automatic global modes.
- Automatic mode dims the source page, offers Stop to switch globally to
  semi-automatic, inserts exact result Markdown, waits for ChatGPT to finish,
  and clicks Send without foregrounding a background tab.
- Semi-automatic mode keeps working in the background, notifies when ready, and
  uses the first toolbar click to replace the composer without Send. The next
  click opens the settings drawer.
- Closing a source tab leaves the job running and makes its completed result an
  orphaned saved result with a clipboard action.
- Includes a drawer action that sends the combined purpose and exact-format
  instruction.
- Opens configuration in an extension-owned iframe drawer over the current
  ChatGPT page. It no longer creates a separate Chrome window, and clicking the
  backdrop, the close button, or Escape closes the drawer.
- Handles recognizable malformed requests after streaming ends, with one
  corrective instruction allowed between valid requests.
- Persists job relationships and uses a 30-second Chrome alarm as a fallback if
  the Manifest V3 service worker is suspended.

## Backend Behavior Implemented

- Binds to `127.0.0.1:3099` by default.
- Provides health, login, token check, submit, list, status, 30-second wait, and
  manual Retry endpoints.
- Processes exactly one bridge job at a time and preserves queue order.
- Writes concise job lifecycle messages to standard output when a job is
  queued, started, completed, failed, or queued again for Retry. PM2 captures
  these messages through `pm2 logs fetch-trends-autocomplete-api`. Logs include
  job IDs and status but do not include seed text.
- Reuses the existing Playwright collector, resume state, analysis, exporter,
  and exact Markdown file.
- Preserves queued and completed rows after restart. A processing row is marked
  failed at startup and can be retried manually.
- Continues backend work if the ChatGPT source tab closes.

## Tests Added Or Updated

- Request schema and canonical cache identity tests.
- Salted password, token hashing, replacement, and no-clear-text persistence
  tests.
- Queue order, single-worker, cache reuse, lifecycle logging, restart failure,
  and Retry tests.
- HTTP login, authorization, submission, long-poll, completion, and cache tests
  with a fake runner.
- Pure extension request parsing and instruction-contract tests.
- Extension UI contract tests for the ChatGPT-only drawer resources and the
  absence of separate-window creation.
- Migration, command-documentation, and local release packaging coverage.
- Existing Playwright fallback tests now generate platform-correct executable
  fixtures so the full suite is portable.

## Verification Results

- `npm test -- --reporter=dot`: passed, 47 files and 149 tests.
- `npm run build`: passed.
- `npm run lint`: passed.
- Extension JavaScript `node --check`: passed.
- Manifest JSON and single-instance PM2 configuration validation: passed.
- In-process HTTP integration test on an ephemeral loopback port: passed.
- Compiled diagnostics against a migrated temp DB: 56 pass, 7 warnings, 0
  failures, and 9 skipped checks. Warnings are for optional local services and
  credentials.

The normal `npm run release:check` wrapper could not run to completion in the
restricted implementation sandbox because `tsx` and PM2 cannot create their
local IPC sockets there. Its test, build, lint, migration, documentation, bin,
and package checks were run directly and passed. PM2 configuration was checked
statically. A real PM2 start and live Chrome interaction remain operator-side
manual checks on macOS. The workspace browser smoke test could not run because
its Chromium binary was absent and the restricted network returned an empty
browser archive when Playwright attempted to install it.

## Known Limitations

- ChatGPT has no stable public DOM contract for this integration. The content
  script centralizes multiple composer, Send, Stop, and assistant-message
  selectors, but a future ChatGPT redesign may require selector updates.
- Automatic composer insertion and background Send require a manual smoke test
  in the operator's signed-in ChatGPT session.
- The extension does not reconnect a closed job to a later reopened
  conversation. It intentionally keeps the result as an orphaned clipboard
  item.
- Disconnect does not revoke the server-side hash. The next successful login
  replaces it.
- Live Google collection may fail on CAPTCHA or anti-bot pages. The job becomes
  failed and remains available for manual Retry.

## Follow-Up Work

- Perform one automatic and one semi-automatic end-to-end run on the operator's
  Mac with the real ChatGPT DOM and Google collector.
- Record selector fixtures if ChatGPT DOM regressions become frequent.
- Add signed private packaging only if the unpacked extension needs broader
  distribution.
