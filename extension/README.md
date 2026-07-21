# Fetch Trends Autocomplete Bridge Extension

This is a private unpacked Manifest V3 extension for `chatgpt.com`. It handles
two research triggers in new assistant messages:

- the first strict `autocomplete_check` JSON block, which runs through the
  local backend
- the first valid `https://trends.google.com/.../explore?...q=...` URL, which
  runs as a local screenshot operation after the response finishes

Requests from the same assistant response form one bundle. Autocomplete and
Google Trends can run independently, but the extension returns them to
ChatGPT together only after both finish.

The extension stores the backend endpoint, username, long-lived token, mode,
and job UI state in `chrome.storage.local`. A pending Google Trends screenshot
is kept only until it is attached successfully. The extension never stores the
password.

## Load locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked**.
4. Choose this `extension/` directory.
5. Reload an open `chatgpt.com` tab, or open a new one.
6. Pin the extension and click its toolbar icon.
7. Complete the connection form in the drawer over the right side of ChatGPT.
8. Select **Allow screenshots** once if Google Trends capture is needed.

Google Trends capture opens one temporary background tab at a time. Chrome
briefly activates that tab for visible-tab capture, crops the search controls
and Interest over time card, closes the tab, and returns to the source ChatGPT
conversation. Login, consent, CAPTCHA, and missing-chart states leave the tab
open for manual recovery. The drawer provides Retry when recovery does not
resume automatically.

Automatic mode inserts the complete bundle and sends once. Semi-automatic
mode shows the purple ready icon; the first toolbar click inserts the complete
bundle without sending, and the next click opens the drawer. Inactive mode
ignores new triggers.

The extension requests additional endpoint permission from the Connect button
when the configured backend is not the default loopback address.

Chrome visible-tab capture requires broad page access. The extension declares
that host access as optional and requests it only from the explicit **Allow
screenshots** action.
