# Autocomplete Utility

This directory contains Google Autocomplete seed expansion, collection, normalization, analysis, and export behavior.

Outputs for each run stay local and share one basename:
- unique-prediction CSV
- full JSON report
- Markdown report
- per-seed summary CSV/JSON
- resume state JSON

When `--out` is omitted, the basename starts with local date and minute, for example `2026-07-09_18:12_company`.

Default modifiers are neutral business-validation terms. Pass `--modifier` or `--modifiers` for domain-specific expansion.

The utility validates search language, not demand volume.

Keep Playwright collection respectful:

- use delays
- stop on CAPTCHA or anti-bot pages
- do not bypass access controls
- support deterministic tests outside live collection
