# Export

This directory assembles local export bundles and backup/restore helpers.

Responsibilities:

- build idea and portfolio export bundles from SQLite rows
- redact sensitive fields for sharing
- create and validate local backup manifests
- restore database and artifact copies from a verified backup

Keep the code local-first and deterministic for tests.
