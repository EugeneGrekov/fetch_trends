import type { DatabaseSync } from 'node:sqlite';
import {
  EXTERNAL_EVIDENCE_MIGRATION_ID,
  INITIAL_MIGRATION_ID,
  PIVOT_PERSEVERE_LOOP_MIGRATION_ID,
  POST_LAUNCH_MEASUREMENT_MIGRATION_ID,
  SCHEDULED_REVALIDATION_MIGRATION_ID,
} from '../db/migrations.js';
import type { DiagnosticCheck, DiagnosticContext } from './types.js';
import { countRows, inspectDatabaseFile, listTables, openReadonlyDatabase } from './sqlite.js';

const REQUIRED_TABLES = [
  'schema_migrations',
  'ideas',
  'jobs',
  'tool_runs',
  'queries',
  'autocomplete_predictions',
  'scores',
  'reports',
  'sources',
  'evidence',
  'competitors',
  'experiments',
  'experiment_events',
  'measurement_snapshots',
  'experiment_decisions',
  'idea_decisions',
  'revalidation_rules',
  'revalidation_runs',
  'revalidation_queue',
];

const EXPECTED_MIGRATIONS = [
  INITIAL_MIGRATION_ID,
  EXTERNAL_EVIDENCE_MIGRATION_ID,
  POST_LAUNCH_MEASUREMENT_MIGRATION_ID,
  PIVOT_PERSEVERE_LOOP_MIGRATION_ID,
  SCHEDULED_REVALIDATION_MIGRATION_ID,
];

const LATEST_MIGRATION_ID = EXPECTED_MIGRATIONS[EXPECTED_MIGRATIONS.length - 1] ?? INITIAL_MIGRATION_ID;

export async function checkDatabaseHealth(context: DiagnosticContext): Promise<DiagnosticCheck[]> {
  const checks: DiagnosticCheck[] = [];
  const fileState = await inspectDatabaseFile(context.dbPath);

  checks.push({
    id: 'db.file_exists',
    label: 'Database file',
    category: 'database',
    status: fileState.exists ? 'pass' : 'fail',
    message: fileState.exists
      ? 'SQLite database file exists.'
      : 'SQLite database file does not exist.',
    details: {
      path: context.dbPath,
      readable: fileState.readable,
      sizeBytes: fileState.sizeBytes,
    },
    nextAction: fileState.exists ? undefined : 'Run npm run db -- --migrate or create data by running a validation job.',
  });

  checks.push({
    id: 'db.file_readable',
    label: 'Database readability',
    category: 'database',
    status: fileState.readable ? 'pass' : 'fail',
    message: fileState.readable
      ? 'SQLite database file is readable.'
      : 'SQLite database file is not readable.',
    details: {
      errorMessage: fileState.errorMessage,
    },
    nextAction: fileState.readable ? undefined : 'Check the database path and local file permissions.',
  });

  if (!fileState.exists || !fileState.readable) {
    return [
      ...checks,
      skippedDatabaseCheck('db.required_tables', 'Required database tables', 'Database schema checks skipped because the DB file is unavailable.'),
      skippedDatabaseCheck('db.migration_table', 'Migration table', 'Migration checks skipped because the DB file is unavailable.'),
      skippedDatabaseCheck('db.latest_migration', 'Latest migration', 'Latest migration check skipped because the DB file is unavailable.'),
      skippedDatabaseCheck('db.counts', 'Database row counts', 'Row counts skipped because the DB file is unavailable.'),
      skippedDatabaseCheck('db.integrity', 'SQLite integrity check', 'Integrity check skipped because the DB file is unavailable.'),
    ];
  }

  let db: DatabaseSync;
  try {
    db = openReadonlyDatabase(context.dbPath);
  } catch (error) {
    return [
      ...checks,
      {
        id: 'db.open',
        label: 'Database open',
        category: 'database',
        status: 'fail',
        message: 'SQLite database could not be opened for diagnostics.',
        details: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        nextAction: 'Verify that the file is a valid SQLite database and is not locked by another process.',
      },
    ];
  }

  try {
    const tables = listTables(db);
    const missingTables = REQUIRED_TABLES.filter((table) => !tables.includes(table));

    checks.push({
      id: 'db.required_tables',
      label: 'Required database tables',
      category: 'database',
      status: missingTables.length === 0 ? 'pass' : 'fail',
      message: missingTables.length === 0
        ? 'All required tables are present.'
        : `${missingTables.length} required database table(s) are missing.`,
      details: {
        missingTables,
        tableCount: tables.length,
      },
      nextAction: missingTables.length === 0 ? undefined : 'Run npm run db -- --migrate against this database.',
    });

    const hasMigrationTable = tables.includes('schema_migrations');
    checks.push({
      id: 'db.migration_table',
      label: 'Migration table',
      category: 'database',
      status: hasMigrationTable ? 'pass' : 'fail',
      message: hasMigrationTable
        ? 'schema_migrations table exists.'
        : 'schema_migrations table is missing.',
      nextAction: hasMigrationTable ? undefined : 'Run npm run db -- --migrate to initialize schema tracking.',
    });

    const appliedMigrations = hasMigrationTable ? readAppliedMigrations(db) : [];
    const latestApplied = appliedMigrations.includes(LATEST_MIGRATION_ID);
    checks.push({
      id: 'db.latest_migration',
      label: 'Latest migration',
      category: 'database',
      status: latestApplied ? 'pass' : 'warn',
      message: latestApplied
        ? `Latest known migration ${LATEST_MIGRATION_ID} is applied.`
        : `Latest known migration ${LATEST_MIGRATION_ID} is not applied.`,
      details: {
        appliedMigrations,
        expectedLatestMigration: LATEST_MIGRATION_ID,
      },
      nextAction: latestApplied ? undefined : 'Run npm run db -- --migrate before relying on new features.',
    });

    checks.push(readCountCheck(db, tables));
    checks.push(readIntegrityCheck(db));
  } finally {
    db.close();
  }

  return checks;
}

function skippedDatabaseCheck(id: string, label: string, message: string): DiagnosticCheck {
  return {
    id,
    label,
    category: 'database',
    status: 'skip',
    message,
  };
}

function readAppliedMigrations(db: DatabaseSync): string[] {
  return (db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as Array<{ id: string }>).map((row) => row.id);
}

function readCountCheck(db: DatabaseSync, tables: string[]): DiagnosticCheck {
  const counts: Record<string, number> = {};
  const countableTables = [
    'ideas',
    'jobs',
    'reports',
    'sources',
    'evidence',
    'experiments',
    'experiment_decisions',
    'idea_decisions',
  ];
  const missingTables = countableTables.filter((table) => !tables.includes(table));

  for (const table of countableTables) {
    if (tables.includes(table)) {
      counts[table] = countRows(db, table);
    }
  }

  if (tables.includes('jobs')) {
    const failedJobs = db.prepare(`
      SELECT COUNT(*) AS count
      FROM jobs
      WHERE status = 'failed'
    `).get() as { count: number };
    counts.failed_jobs = failedJobs.count;
  }

  return {
    id: 'db.counts',
    label: 'Database row counts',
    category: 'database',
    status: missingTables.length === 0 ? 'pass' : 'skip',
    message: missingTables.length === 0
      ? 'Basic database counts can be read.'
      : 'Some count queries were skipped because tables are missing.',
    details: {
      counts,
      missingTables,
    },
  };
}

function readIntegrityCheck(db: DatabaseSync): DiagnosticCheck {
  try {
    const row = db.prepare('PRAGMA integrity_check').get() as Record<string, unknown> | undefined;
    const value = row ? Object.values(row)[0] : undefined;
    const ok = value === 'ok';
    return {
      id: 'db.integrity',
      label: 'SQLite integrity check',
      category: 'database',
      status: ok ? 'pass' : 'fail',
      message: ok
        ? 'SQLite integrity check passed.'
        : 'SQLite integrity check did not return ok.',
      details: {
        result: value,
      },
      nextAction: ok ? undefined : 'Back up the database file and inspect it manually with sqlite3 PRAGMA integrity_check.',
    };
  } catch (error) {
    return {
      id: 'db.integrity',
      label: 'SQLite integrity check',
      category: 'database',
      status: 'fail',
      message: 'SQLite integrity check failed to run.',
      details: {
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      nextAction: 'Check whether the database is locked or corrupted.',
    };
  }
}
