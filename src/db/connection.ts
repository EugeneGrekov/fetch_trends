import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export const DEFAULT_DB_PATH = './data/fetch-trends.sqlite';

export interface DatabaseHandle {
  db: DatabaseSync;
  dbPath: string;
}

export function resolveDatabasePath(explicitPath?: string): string {
  const configuredPath = explicitPath ?? process.env.FETCH_TRENDS_DB_PATH ?? DEFAULT_DB_PATH;
  if (configuredPath === ':memory:') {
    return configuredPath;
  }

  return resolve(process.cwd(), configuredPath);
}

export async function openDatabase(explicitPath?: string): Promise<DatabaseHandle> {
  const dbPath = resolveDatabasePath(explicitPath);

  if (dbPath !== ':memory:') {
    await mkdir(dirname(dbPath), { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');

  return { db, dbPath };
}
