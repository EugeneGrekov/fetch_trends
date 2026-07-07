import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

export interface DatabaseFileState {
  exists: boolean;
  readable: boolean;
  sizeBytes?: number;
  errorMessage?: string;
}

export async function inspectDatabaseFile(dbPath: string): Promise<DatabaseFileState> {
  if (dbPath === ':memory:') {
    return {
      exists: false,
      readable: false,
      errorMessage: 'In-memory databases are not inspectable across diagnostic checks.',
    };
  }

  try {
    const file = await stat(dbPath);
    if (!file.isFile()) {
      return {
        exists: false,
        readable: false,
        errorMessage: 'Path exists but is not a regular SQLite file.',
      };
    }

    await access(dbPath, constants.R_OK);
    return {
      exists: true,
      readable: true,
      sizeBytes: file.size,
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    return {
      exists: code !== 'ENOENT' && code !== 'ENOTDIR',
      readable: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

export function openReadonlyDatabase(dbPath: string): DatabaseSync {
  return new DatabaseSync(dbPath, { readOnly: true });
}

export function listTables(db: DatabaseSync): string[] {
  return (db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
    ORDER BY name
  `).all() as Array<{ name: string }>).map((row) => row.name);
}

export function hasTable(db: DatabaseSync, tableName: string): boolean {
  const row = db.prepare(`
    SELECT 1 AS present
    FROM sqlite_master
    WHERE type = 'table' AND name = ?
    LIMIT 1
  `).get(tableName) as { present: number } | undefined;
  return row?.present === 1;
}

export function countRows(db: DatabaseSync, tableName: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(tableName)}`).get() as { count: number };
  return row.count;
}

export function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
