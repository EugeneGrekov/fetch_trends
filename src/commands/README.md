# Commands

This directory contains command handlers used by top-level CLI entry files and package scripts.

Keep command handlers thin:

- parse and validate command options
- call domain modules
- print operator-friendly output
- return deterministic exit behavior

Update `docs/reference/commands.md` and command-doc tests whenever command options change.

Current command handlers include `export-data`, `backup`, and `restore` alongside the existing validation, reporting, and maintenance commands.
