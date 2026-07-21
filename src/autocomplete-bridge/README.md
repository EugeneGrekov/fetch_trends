# Autocomplete Bridge Backend

This directory owns the authenticated local API, durable bridge-job queue,
request canonicalization, and adapter to the existing autocomplete runner.

It does not own ChatGPT DOM integration. That code lives in `extension/`.
Only one bridge job is processed at a time.
