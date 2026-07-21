# ChatGPT Google Trends Bridge Implementation

## Summary

Implemented Google Trends screenshot requests in the existing private Chrome
extension. A valid Google Trends Explore URL in a completed assistant response
now creates local capture work. Autocomplete and Trends requests from the same
assistant response are tracked as one persistent result bundle and delivered
only after every requested operation completes.

## Files And Modules Added Or Changed

- `extension/shared.js` adds Trends URL classification, screenshot crop math,
  and response-bundle readiness helpers.
- `extension/content-script.js` associates detections with assistant response
  IDs and supports image or combined Markdown-plus-image composer delivery.
- `extension/trends-content-script.js` detects the Explore controls, Interest
  over time chart, and manual-attention states on the temporary Trends page.
- `extension/service-worker.js` owns persistent response bundles, the global
  one-at-a-time Trends queue, visible-tab capture and cropping, delivery
  coordination, recovery, and source-tab cancellation.
- `extension/manifest.json` registers the Trends content script and declares
  broad screenshot access as an optional host permission.
- `extension/popup.html`, `popup.js`, and `popup.css` add the one-time capture
  permission, local Trends status, and Retry controls to the in-page drawer.
- Extension protocol and UI tests cover the new pure and static contracts.
- Installation, architecture, extension, and implemented-feature references
  describe the expanded bridge.

## Commands Added Or Changed

No CLI, backend API, or PM2 command changed. Google Trends work is entirely
extension-local. The existing backend continues to run only Autocomplete jobs.

## Schema And Migration Changes

No SQLite migration was added. Response bundles, the Trends queue, temporary
tab IDs, and a not-yet-delivered PNG are stored in trusted
`chrome.storage.local` state. The PNG is removed after successful delivery.

## Behavior Implemented

- Detects the first valid HTTPS Google Trends Explore URL with a non-empty `q`
  parameter in links or plain assistant text.
- Waits until the assistant finishes streaming before starting Trends work.
- Keeps Autocomplete's existing immediate streaming detection.
- Runs one Trends operation globally at a time in a temporary background tab.
- Briefly activates the Trends tab, zooms so the two cards fit, captures the
  visible tab, and crops to the Explore controls plus Interest over time card.
- Returns to the originating ChatGPT tab and closes Trends after a successful
  capture.
- Leaves login, consent, CAPTCHA, missing-chart, and capture-error tabs open for
  manual recovery. A ready chart resumes automatically; Retry starts a clean
  attempt.
- Cancels local Trends work if the source ChatGPT tab closes. Any already
  submitted backend Autocomplete job continues under the existing orphan rule.
- Delivers Trends-only as one screenshot with no generated extension text.
- Delivers combined work as Autocomplete Markdown plus the screenshot in one
  ChatGPT message after both finish.
- Preserves automatic Send and semi-automatic first-click preparation behavior.
- Serializes deliveries in each ChatGPT tab and waits for current ChatGPT
  generation to finish before attaching or sending the next result.
- Adds the Google Trends request and relative 0-to-100 interpretation rules to
  the existing ChatGPT instruction action.

## Tests Added Or Updated

- Valid and invalid Google Trends URL parsing.
- First valid URL selection from rendered-link or plain-text candidates.
- CSS viewport to captured-image crop coordinates.
- Complete, incomplete, and delivered response-bundle readiness.
- Manifest registration and optional capture permission contracts.
- Static capture, selected-card, image-attachment, and no-backend-Trends
  contracts.

## Verification Results

- Focused extension tests: passed, 2 files and 12 tests.
- `npm test`: passed, 47 files and 155 tests.
- `npm run build`: passed.
- `npm run lint`: passed.
- Extension JavaScript syntax and manifest JSON checks: passed.

## Known Limitations

- Google Trends and ChatGPT do not expose stable public DOM contracts for these
  pages. Selector fallbacks are centralized, but a redesign can require an
  extension update.
- Chrome visible-tab capture requires optional broad page access. Trends
  requests remain blocked with a clear drawer action until the operator grants
  it.
- A window too small to contain both selected cards after zoom requires the
  operator to enlarge Chrome and Retry.
- Live Trends capture and ChatGPT image upload require a manual smoke test in
  the operator's signed-in Chrome profile.

## Follow-Up Work

- Run one Trends-only and one combined Automatic flow on macOS.
- Run one combined Semi-automatic flow and verify the first and second toolbar
  click behavior.
- Record sanitized DOM fixtures only if live selectors need hardening.
