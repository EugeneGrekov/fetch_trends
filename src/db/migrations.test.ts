import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase } from './connection.js';
import {
  applyMigrations,
  EXTERNAL_EVIDENCE_MIGRATION_ID,
  INITIAL_MIGRATION_ID,
  listAppliedMigrations,
  PIVOT_PERSEVERE_LOOP_MIGRATION_ID,
  POST_LAUNCH_MEASUREMENT_MIGRATION_ID,
} from './migrations.js';

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
      const applied = applyMigrations(db);
      expect(applied.slice(0, 4)).toEqual([
        INITIAL_MIGRATION_ID,
        EXTERNAL_EVIDENCE_MIGRATION_ID,
        POST_LAUNCH_MEASUREMENT_MIGRATION_ID,
        PIVOT_PERSEVERE_LOOP_MIGRATION_ID,
      ]);
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
          'competitors',
          'evidence',
          'experiment_decisions',
          'experiment_events',
          'experiments',
          'idea_decisions',
          'ideas',
          'jobs',
          'measurement_snapshots',
          'queries',
          'reports',
          'schema_migrations',
          'scores',
          'sources',
          'tool_runs',
        ]),
      );
      expect(listAppliedMigrations(db)).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: INITIAL_MIGRATION_ID }),
        expect.objectContaining({ id: EXTERNAL_EVIDENCE_MIGRATION_ID }),
        expect.objectContaining({ id: POST_LAUNCH_MEASUREMENT_MIGRATION_ID }),
        expect.objectContaining({ id: PIVOT_PERSEVERE_LOOP_MIGRATION_ID }),
      ]));
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
