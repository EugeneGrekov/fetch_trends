import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import { applyMigrations, INITIAL_MIGRATION_ID, listAppliedMigrations } from './migrations.js';

const tempDirs: string[] = [];

describe('database migrations', () => {
  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it('creates the validation schema and stays idempotent', async () => {
    const dir = await createTempDir();
    const { db } = await openDatabase(join(dir, 'foundation.sqlite'));

    try {
      expect(applyMigrations(db)).toEqual([INITIAL_MIGRATION_ID]);
      expect(applyMigrations(db)).toEqual([]);

      const tables = db.prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
        ORDER BY name
      `).all() as Array<{ name: string }>;

      expect(tables.map((table) => table.name)).toEqual(
        expect.arrayContaining([
          'autocomplete_predictions',
          'ideas',
          'jobs',
          'queries',
          'reports',
          'schema_migrations',
          'scores',
          'tool_runs',
        ]),
      );
      expect(listAppliedMigrations(db)).toEqual([
        expect.objectContaining({ id: INITIAL_MIGRATION_ID }),
      ]);
    } finally {
      db.close();
    }
  });
});

async function createTempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'fetch-trends-db-'));
  tempDirs.push(dir);
  return dir;
}
