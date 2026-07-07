import type { DatabaseSync } from 'node:sqlite';
import { expectRows } from './results.js';

export const INITIAL_MIGRATION_ID = '001_initial_validation_tables';

interface MigrationDefinition {
  id: string;
  sql: string;
}

const MIGRATIONS: MigrationDefinition[] = [
  {
    id: INITIAL_MIGRATION_ID,
    sql: `
      CREATE TABLE ideas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        raw_description TEXT NOT NULL,
        normalized_json TEXT,
        target_market TEXT,
        platform TEXT,
        expected_price TEXT,
        business_model TEXT,
        status TEXT NOT NULL DEFAULT 'new',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea_id INTEGER NOT NULL,
        job_type TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error_message TEXT,
        FOREIGN KEY (idea_id) REFERENCES ideas(id)
      );

      CREATE TABLE tool_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id INTEGER NOT NULL,
        tool_name TEXT NOT NULL,
        input_json TEXT NOT NULL,
        output_json TEXT,
        metadata_json TEXT,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        error_message TEXT,
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      );

      CREATE TABLE queries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea_id INTEGER NOT NULL,
        query TEXT NOT NULL,
        normalized_query TEXT NOT NULL,
        intent_type TEXT,
        source TEXT NOT NULL,
        priority_score INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (idea_id) REFERENCES ideas(id)
      );

      CREATE TABLE autocomplete_predictions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea_id INTEGER NOT NULL,
        query_id INTEGER,
        prediction TEXT NOT NULL,
        normalized_prediction TEXT NOT NULL,
        intent TEXT NOT NULL,
        confidence_score INTEGER NOT NULL,
        source_seed TEXT NOT NULL,
        source_prefix TEXT NOT NULL,
        country TEXT NOT NULL,
        language TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (idea_id) REFERENCES ideas(id),
        FOREIGN KEY (query_id) REFERENCES queries(id)
      );

      CREATE TABLE scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea_id INTEGER NOT NULL,
        score_type TEXT NOT NULL,
        score_json TEXT NOT NULL,
        total_score INTEGER NOT NULL,
        decision TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (idea_id) REFERENCES ideas(id)
      );

      CREATE TABLE reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea_id INTEGER NOT NULL,
        job_id INTEGER,
        report_type TEXT NOT NULL,
        markdown TEXT NOT NULL,
        json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (idea_id) REFERENCES ideas(id),
        FOREIGN KEY (job_id) REFERENCES jobs(id)
      );

      CREATE INDEX idx_jobs_idea_id ON jobs (idea_id);
      CREATE INDEX idx_tool_runs_job_id ON tool_runs (job_id);
      CREATE INDEX idx_queries_idea_id ON queries (idea_id);
      CREATE INDEX idx_queries_normalized_query ON queries (normalized_query);
      CREATE INDEX idx_autocomplete_predictions_idea_id ON autocomplete_predictions (idea_id);
      CREATE INDEX idx_autocomplete_predictions_query_id ON autocomplete_predictions (query_id);
      CREATE INDEX idx_autocomplete_predictions_normalized_prediction ON autocomplete_predictions (normalized_prediction);
      CREATE INDEX idx_scores_idea_id ON scores (idea_id);
      CREATE INDEX idx_reports_idea_id ON reports (idea_id);
      CREATE INDEX idx_reports_job_id ON reports (job_id);
    `,
  },
];

export interface AppliedMigration {
  id: string;
  applied_at: string;
}

export function ensureMigrationTable(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );
  `);
}

export function applyMigrations(db: DatabaseSync): string[] {
  ensureMigrationTable(db);

  const applied = new Set(
    (db.prepare('SELECT id FROM schema_migrations ORDER BY id').all() as Array<{ id: string }>).map((row) => row.id),
  );
  const appliedNow: string[] = [];

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) {
      continue;
    }

    const appliedAt = new Date().toISOString();
    runInTransaction(db, () => {
      db.exec(migration.sql);
      db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (:id, :appliedAt)').run({
        id: migration.id,
        appliedAt,
      });
    });
    appliedNow.push(migration.id);
  }

  return appliedNow;
}

export function listAppliedMigrations(db: DatabaseSync): AppliedMigration[] {
  ensureMigrationTable(db);
  return expectRows<AppliedMigration>(
    db.prepare('SELECT id, applied_at FROM schema_migrations ORDER BY id').all(),
  );
}

function runInTransaction(db: DatabaseSync, operation: () => void): void {
  db.exec('BEGIN');
  try {
    operation();
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
