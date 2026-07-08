# Data

This directory contains tracked example inputs for local commands and tests.

Generated databases are ignored by git and should not be committed:

- `*.sqlite`
- `*.sqlite-*`
- `*.db`
- `*.db-*`

Use temporary databases for tests and local experiments unless a tracked fixture is intentional.
