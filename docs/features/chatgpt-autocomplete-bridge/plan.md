# ChatGPT Autocomplete Bridge Plan

## Goal

Add a private Manifest V3 Chrome extension and a local API that connect
ChatGPT conversations to the existing Google Autocomplete research runner.
The bridge must support jobs that take about 30 minutes without requiring a
Custom GPT or a long-running ChatGPT Action.

## Prerequisite

- The autocomplete runner in `src/utilities/autocomplete/` remains the source
  of collection and Markdown report behavior.
- SQLite migrations and local result directories are available.
- Chromium and Playwright are installed for live collection.
- The local API is managed by PM2 and binds to `127.0.0.1:3099` by default.

## Non-Goals

- Publishing the extension to the Chrome Web Store.
- Reading credentials from Chrome Password Manager.
- Storing the backend password in the extension.
- Cancelling a job after it has been submitted.
- Running more than one autocomplete collection at a time.
- Automatically reconnecting a completed job to a reopened ChatGPT
  conversation after its original tab was closed.
- Supporting ChatGPT DOM structures other than `chatgpt.com` in this phase.

## Target Structure

```text
extension/
  manifest.json
  shared.js
  service-worker.js
  content-script.js
  popup.html
  popup.js
  popup.css
  README.md
  icons/

src/autocomplete-bridge/
  auth.ts
  jobs.ts
  protocol.ts
  research.ts
  server.ts
  service.ts
  types.ts
  README.md

src/commands/
  autocomplete-api.ts
  autocomplete-user.ts

config/
  autocomplete-users.example.json

docs/features/chatgpt-autocomplete-bridge/
  README.md
  plan.md
  implementation.md
```

## Implementation Steps

1. Add a SQLite migration and repository for bridge jobs.
2. Add request validation and a canonical cache key that ignores seed and
   modifier order, case, repeated whitespace, and duplicate rows.
3. Add local file authentication with salted password hashes and one
   long-lived hashed token per user.
4. Add a user-management command that creates or replaces a user without
   storing a clear-text password.
5. Add an authenticated API for login, token checking, job submission, job
   listing, job retry, and 30-second long polling.
6. Run queued autocomplete jobs sequentially through the existing runner and
   store the generated Markdown in SQLite as well as the normal result files.
7. Mark a processing job failed after a server restart. Preserve queued,
   completed, and already failed jobs.
8. Add a PM2 ecosystem configuration and operator commands.
9. Add the extension service worker, content script, toolbar state colors,
   in-page settings drawer, job list, notifications, and ChatGPT composer
   integration.
10. Add automated backend and protocol tests plus operator documentation.

## Data / API / CLI Contracts

### ChatGPT request block

The first complete valid fenced JSON block in an assistant response is used.
No version or request ID is present.

```json
{
  "type": "autocomplete_check",
  "seeds": ["ai app builder for business research"],
  "modifiers": ["for", "with"]
}
```

`seeds` is required and contains non-empty strings. `modifiers` is optional.
When omitted, the existing organic autocomplete mode is used. When present,
only the supplied modifiers are used. Unknown fields make the request
malformed.

### Authentication

- `POST /api/auth/login` accepts endpoint-local username and password.
- The server validates a salted password hash and returns a random long-lived
  token.
- The extension stores only endpoint, username, token, and UI state in
  `chrome.storage.local`. It immediately discards the password.
- The server stores only the token hash and replaces the previous token on the
  next successful login.
- Disconnect deletes the extension's local token. It does not call a server
  revocation endpoint.
- `GET /api/auth/check` validates the bearer token.

### Jobs

- `POST /api/jobs` submits `seeds` and optional `modifiers`.
- `GET /api/jobs` lists recent saved jobs.
- `GET /api/jobs/:id` returns current state.
- `GET /api/jobs/:id/wait?timeout=30` waits up to 30 seconds and returns early
  when job state changes.
- `POST /api/jobs/:id/retry` moves a failed job back to the queue.
- Job states are `queued`, `processing`, `completed`, and `failed`.
- Identical canonical requests always return the first stored job and result.
- The result is the exact generated Markdown report.

### PM2 and commands

```text
npm run autocomplete:user -- add --username <name>
npm run build
pm2 start ecosystem.config.cjs
pm2 save
```

### Extension modes

- `inactive`: connected but does not inspect or submit requests.
- `automatic`: detects, submits, long-polls, replaces the composer with the
  result, waits for current ChatGPT generation to finish, and clicks Send.
- `semi-automatic`: detects, submits, and long-polls. The first toolbar click
  when ready replaces the composer without sending. The next click opens the
  settings drawer over the current ChatGPT page.

The selected mode is global across all ChatGPT tabs. The first connection
starts inactive. Later connections restore the previous selected mode.

### Toolbar colors for the current tab

| State | Color |
| --- | --- |
| Disconnected | Dark gray |
| Connected and inactive | Light gray |
| Automatic and idle | Green |
| Semi-automatic and idle | Blue |
| Queued | Yellow |
| Processing | Orange |
| Semi-automatic result ready | Purple |
| Error or malformed request | Red |

### Tab behavior

- Every open `chatgpt.com` tab is monitored, including background tabs.
- Only the first request block in one assistant response is accepted.
- A valid block is submitted as soon as the complete JSON first appears while
  the response is streaming.
- Automatic mode shows a page-dimming progress overlay with a Stop button.
- Stop changes the global mode to semi-automatic and removes the overlay. It
  does not cancel the backend job.
- Automatic result insertion and Send work in the background without bringing
  the tab forward.
- A semi-automatic result in a background tab creates a desktop notification.
  Clicking it activates that tab but does not insert or send the result.
- If the source tab closes, the backend job continues. Its result remains in
  the settings drawer as an orphaned saved result. Clicking an orphaned result
  copies its Markdown to the clipboard.
- A normal toolbar click opens a right-side settings drawer inside the current
  ChatGPT page. It does not create a separate Chrome window or toolbar popup.
- The drawer uses an extension-owned iframe so its connection fields are not
  part of the ChatGPT page DOM.

### Instruction and malformed recovery

- A drawer action injects and sends one combined instruction explaining why
  autocomplete research is used and the exact request JSON format.
- Instructions are not automatically injected in every new chat.
- A recognizable but malformed `autocomplete_check` is handled only after the
  assistant stops streaming.
- Automatic mode injects and sends a corrective instruction.
- Semi-automatic mode shows red. The first toolbar click inserts the corrective
  instruction without sending; the next click opens the settings drawer.
- At most one corrective instruction is allowed between valid autocomplete
  requests. A valid request resets that allowance.
- Text that does not contain a recognizable `autocomplete_check` is ignored.

### Failure and reconnection

- The extension reconnects automatically with its stored token.
- Existing jobs resume long polling after network reconnection.
- Requests that appear while disconnected are ignored.
- Failed jobs are not retried automatically and expose a manual Retry action.
- A PM2 restart marks the active processing job failed. Manual Retry may resume
  its existing autocomplete artifact.

## Testing Plan

- Unit-test request validation, canonicalization, duplicate removal, and stable
  cache keys.
- Unit-test password hashing, token hashing, token replacement, and config-file
  persistence without clear-text passwords.
- Unit-test job creation, cache hits, queue order, state transitions, retry,
  and interrupted-job failure.
- Integration-test login, authenticated job APIs, long polling, cached
  submission, and retry with a fake research runner.
- Unit-test the extension's JSON block parsing and malformed classification as
  pure JavaScript.
- Run the existing full project suite and build.

Default automated tests must not call Google, ChatGPT, or another live service.

## Verification

```text
npm test
npm run build
npm run lint
```

Manual verification additionally loads `extension/` as an unpacked extension,
connects to the PM2-managed local API, and exercises one automatic and one
semi-automatic request in separate ChatGPT tabs.

## Acceptance Criteria

- The extension never persists the password.
- A valid request from any open ChatGPT tab creates or reuses one backend job.
- Only one research job processes at a time.
- Canonically identical requests reuse the first job forever.
- A 30-minute job can survive extension service-worker suspension through
  persisted state, long polling, and a periodic wake-up fallback.
- Automatic and semi-automatic completion follow their specified insertion and
  Send behavior.
- Toolbar state reflects the current ChatGPT tab.
- Configuration opens in a drawer over ChatGPT without a separate window.
- PM2 can run the built API on `127.0.0.1:3099`.
- Existing autocomplete CLI behavior and tests remain compatible.

## Risks

- ChatGPT DOM selectors can change. Keep all selector fallbacks in one content
  script section and report actionable insertion errors.
- Manifest V3 service workers may be suspended. Persist job state and add a
  Chrome alarm fallback in addition to long polling.
- Google may show CAPTCHA or anti-bot pages. Record the job as failed and leave
  manual Retry available.
- A long-lived token is a secret even though it is not the password. Restrict
  the server to loopback, store only its hash on the server, and restrict
  extension storage access to trusted extension contexts.

## Recommended Next Phase

After local manual verification, harden DOM compatibility against recorded
ChatGPT fixtures and package a signed private extension build if distribution
outside the operator's Chrome profile becomes necessary.
