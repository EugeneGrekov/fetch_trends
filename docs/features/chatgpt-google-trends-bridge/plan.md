# ChatGPT Google Trends Bridge Plan

## Goal

Extend the existing ChatGPT Autocomplete Bridge so a ready-to-open Google
Trends Explore URL in a completed assistant response triggers an automated
screenshot. Capture the search-term controls and Interest over time card,
then attach the screenshot to the originating ChatGPT conversation. When the
same assistant response requests Autocomplete and Google Trends, start both
operations independently but deliver their results together.

## Prerequisite

- The Manifest V3 extension monitors all open `chatgpt.com` tabs.
- Automatic, semi-automatic, and inactive modes already work.
- Autocomplete jobs already persist across service-worker suspension and
  deliver Markdown to their source tabs.
- The extension configuration opens in an in-page drawer.

## Non-Goals

- Interpreting Google Trends data in the extension.
- Converting relative interest into absolute search volume.
- Calling an unofficial Google Trends API.
- Running more than one Google Trends capture at a time.
- Adding Google Trends work to the local backend or SQLite queue.
- Supporting Google Trends pages other than HTTPS `/explore` URLs.
- Automatically solving login, consent, or CAPTCHA pages.

## Target Structure

```text
extension/
  manifest.json
  shared.js
  service-worker.js
  content-script.js
  trends-content-script.js
  popup.html
  popup.js
  popup.css

docs/features/chatgpt-google-trends-bridge/
  README.md
  plan.md
  implementation.md

src/autocomplete-bridge/
  extension-protocol.test.ts
  extension-ui.test.ts
```

## Implementation Steps

1. Add pure Google Trends URL detection for clickable links and plain text.
2. Track each assistant response separately so Autocomplete may start while
   streaming, Trends starts after streaming, and both share one result bundle.
3. Add a persistent extension-local bundle model for requested, running,
   ready, failed, and delivered work.
4. Add a global one-at-a-time Google Trends queue that opens the exact URL in a
   background temporary tab.
5. Add a Google Trends content script that detects the search controls and the
   Interest over time card, reports manual-attention pages, and resumes after
   the user resolves them.
6. Temporarily activate the Trends tab, use Chrome's visible-tab capture,
   crop to the combined two-card rectangle, restore the source ChatGPT tab,
   and close the Trends tab on success.
7. Add ChatGPT image attachment and combined Markdown-plus-image delivery.
8. Preserve automatic and semi-automatic toolbar semantics for complete
   response bundles.
9. Add one-time optional screenshot permission from the settings drawer.
10. Add retry and status information for local Trends work.
11. Update architecture, installation, extension, and implementation docs.

## Data / API / CLI Contracts

### Google Trends trigger

- The assistant response must be finished streaming.
- Use the first URL in that response whose parsed value has:
  - protocol `https:`
  - hostname `trends.google.com`
  - pathname `/explore` or a locale-prefixed path ending in `/explore`
  - a non-empty `q` query parameter
- Detect both rendered links and plain-text URLs.
- Preserve and open the exact detected URL.
- Process the URL once per assistant response. The same URL in a later response
  is a new request.

### Response bundle

- One assistant response produces one extension result bundle.
- An Autocomplete request may start as soon as its complete valid JSON block
  appears during streaming.
- A Trends request starts after the response finishes streaming.
- A bundle is deliverable only after the response is finalized and every
  requested operation has completed.
- Do not submit partial results. A failed operation blocks delivery until it
  succeeds through retry or manual recovery.
- If only one operation was requested, deliver that result normally.

### Modes

- `inactive`: ignore both request types.
- `automatic`: when the complete bundle is ready, insert Autocomplete Markdown
  when present, attach the Trends PNG when present, and click Send once.
- `semi-automatic`: when the complete bundle is ready, show the ready color.
  The first toolbar click inserts and attaches everything without sending. The
  next click opens the settings drawer.

### Capture and recovery

- Process one Trends request globally at a time.
- Use the current Chrome profile and Google session.
- Load the temporary Trends tab in the background.
- If needed, use per-tab zoom so the two target cards fit in the viewport.
- Activate the tab only for `captureVisibleTab`, crop outside the two target
  cards, then reactivate the originating ChatGPT tab.
- On login, consent, CAPTCHA, or missing chart, leave the Trends tab open and
  mark the source bundle as needing attention.
- After the user resolves the page, detect the chart and resume automatically.
- If the source ChatGPT tab closes, cancel and remove its local Trends work.
- Store at most the pending screenshot needed for delivery and delete it after
  successful attachment.

### Permission

- Request the optional all-web-pages host permission once from an explicit
  settings-drawer action.
- Use that permission only for the automatic visible-tab screenshot.

## Testing Plan

- Unit-test valid and invalid Google Trends URL detection.
- Unit-test first-URL and once-per-response behavior.
- Unit-test screenshot crop coordinate calculations.
- Test bundle readiness for Autocomplete-only, Trends-only, combined, failed,
  retried, and finalized states.
- Add static extension contracts for permissions, Trends content-script
  registration, image attachment, and absence of backend Trends work.
- Default tests must not call Google Trends or ChatGPT.
- Perform a manual Chrome smoke test on macOS for capture and ChatGPT upload.

## Verification

```text
npm test
npm run build
npm run lint
node --check extension/shared.js
node --check extension/service-worker.js
node --check extension/content-script.js
node --check extension/trends-content-script.js
node --check extension/popup.js
```

## Acceptance Criteria

- The first valid Trends URL in a completed assistant response runs once.
- Autocomplete and Trends from the same response run concurrently but submit
  as one ChatGPT message after both finish.
- The screenshot contains the search terms, market, period, legend, Interest
  over time chart, and average-interest comparison shown in the selected area.
- The temporary Trends tab is foregrounded only for capture.
- Successful capture closes Trends and returns to the source ChatGPT tab.
- Automatic and semi-automatic behavior follows the existing toolbar model.
- Manual Google intervention can resume without creating a new request.
- The extension never interprets the chart.
- Existing Autocomplete-only behavior remains compatible.

## Risks

- Google Trends and ChatGPT DOM structures are not public stable contracts.
  Centralize selector fallbacks and expose actionable retry errors.
- Visible-tab capture requires a broad optional host permission. Request it
  explicitly and keep Trends disabled until granted.
- Manifest V3 suspension can interrupt in-memory work. Persist bundle, queue,
  tab, and screenshot state before asynchronous boundaries.
- Image attachment can change with ChatGPT's composer. Use multiple upload
  fallbacks and verify the preview before Send.

## Recommended Next Phase

Record minimal sanitized DOM fixtures from Google Trends and ChatGPT after the
first macOS smoke test, then use them to harden selectors without adding a live
service dependency to the test suite.
