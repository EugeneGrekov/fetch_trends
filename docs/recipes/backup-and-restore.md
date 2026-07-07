# Backup And Restore

## When To Use

Use this before risky local changes, before moving machines, or before testing restore behavior.

## Prerequisites

- The local database has been migrated.
- You know whether artifacts and results should be preserved with the database.
- No workflow command is actively writing to the database during the copy.

## Commands

```bash
npm run db -- --migrate
mkdir -p ./backups
cp ./data/fetch-trends.sqlite ./backups/fetch-trends-2026-07-07.sqlite
cp -R ./artifacts ./backups/artifacts-2026-07-07
cp -R ./results ./backups/results-2026-07-07
cp ./backups/fetch-trends-2026-07-07.sqlite ./data/fetch-trends.sqlite
npm run report -- --idea-id <idea-id> --format markdown
```

Replace the date and paths with the backup set you are creating or restoring.

## Expected Outputs

- A copied SQLite database under `./backups/`.
- Optional copied artifact and result directories.
- A successful report read after restore.

## How To Read The Result

A successful report read proves the restored database can be opened and queried. It does not prove every artifact path still exists, so check any required files under `./artifacts/` and `./results/` separately.

## Failure Handling

- If the database file is missing, run `npm run db -- --migrate` and confirm the active `--db` or `FETCH_TRENDS_DB_PATH`.
- If restore overwrites the wrong file, stop and copy the backup to a new path first, then pass that path with `--db`.
- If reports load but artifacts are missing, restore the matching artifact and result folders from the same backup date.
- If a command is running during backup, stop it and take a new copy.

## Next Step

After restore, inspect the setup with [Diagnose Local Setup](./diagnose-local-setup.md).
