# Fetch Trends Autocomplete Bridge Extension

This is a private unpacked Manifest V3 extension for `chatgpt.com`. It detects
the first strict `autocomplete_check` JSON code block in a new assistant
message, submits it to the local backend, tracks the long-running job, and
returns the generated Markdown report according to the selected mode.

The extension stores the backend endpoint, username, long-lived token, mode,
and job UI state in `chrome.storage.local`. It never stores the password.

## Load locally

1. Open `chrome://extensions`.
2. Enable Developer mode.
3. Select **Load unpacked**.
4. Choose this `extension/` directory.
5. Pin the extension and complete the connection window.

The extension requests additional endpoint permission from the Connect button
when the configured backend is not the default loopback address.
