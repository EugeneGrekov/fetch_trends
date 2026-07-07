import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';

export interface TempDatabaseOptions {
  fileName?: string;
  migrate?: boolean;
  prefix?: string;
}

export interface TempDatabase {
  cleanup: () => Promise<void>;
  db: DatabaseSync;
  dbPath: string;
  dir: string;
}

export async function createTempDatabase(options: TempDatabaseOptions = {}): Promise<TempDatabase> {
  const dir = await mkdtemp(join(tmpdir(), options.prefix ?? 'fetch-trends-test-'));
  const { db, dbPath } = await openDatabase(join(dir, options.fileName ?? 'test.sqlite'));

  if (options.migrate ?? true) {
    applyMigrations(db);
  }

  return {
    cleanup: async () => {
      closeDatabase(db);
      await rm(dir, { recursive: true, force: true });
    },
    db,
    dbPath,
    dir,
  };
}

function closeDatabase(db: DatabaseSync): void {
  try {
    db.close();
  } catch (error) {
    if (!isAlreadyClosedError(error)) {
      throw error;
    }
  }
}

function isAlreadyClosedError(error: unknown): boolean {
  return error instanceof Error && /closed/i.test(error.message);
}
