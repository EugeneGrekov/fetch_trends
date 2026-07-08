# Database

This directory owns SQLite persistence.

Responsibilities:

- open local database connections
- define schema and migrations
- expose repositories for validation, evidence, reports, experiments, decisions, and revalidation
- support deterministic test databases

Schema changes require migration tests and updates to affected repositories.
