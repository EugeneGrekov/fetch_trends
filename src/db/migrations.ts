import type { DatabaseSync } from 'node:sqlite';
import { expectRows } from './results.js';

export const INITIAL_MIGRATION_ID = '001_initial_validation_tables';
export const EXTERNAL_EVIDENCE_MIGRATION_ID = '002_external_evidence_tables';
export const POST_LAUNCH_MEASUREMENT_MIGRATION_ID = '003_post_launch_measurement_tables';
export const PIVOT_PERSEVERE_LOOP_MIGRATION_ID = '004_pivot_persevere_loop_tables';
export const SCHEDULED_REVALIDATION_MIGRATION_ID = '005_scheduled_revalidation_tables';

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
  {
    id: EXTERNAL_EVIDENCE_MIGRATION_ID,
    sql: `
      CREATE TABLE sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea_id INTEGER NOT NULL,
        url TEXT NOT NULL,
        source_type TEXT NOT NULL,
        title TEXT,
        snippet TEXT,
        fetched_at TEXT NOT NULL,
        FOREIGN KEY (idea_id) REFERENCES ideas(id)
      );

      CREATE TABLE evidence (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea_id INTEGER NOT NULL,
        source_id INTEGER NOT NULL,
        quote TEXT NOT NULL,
        pain_type TEXT,
        trigger TEXT,
        workaround TEXT,
        complaint TEXT,
        urgency TEXT,
        payment_signal TEXT,
        confidence_score INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (idea_id) REFERENCES ideas(id),
        FOREIGN KEY (source_id) REFERENCES sources(id)
      );

      CREATE TABLE competitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        url TEXT NOT NULL,
        product_type TEXT,
        price_text TEXT,
        pricing_model TEXT,
        strengths_json TEXT,
        weaknesses_json TEXT,
        review_summary TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (idea_id) REFERENCES ideas(id)
      );

      CREATE INDEX idx_sources_idea_id ON sources (idea_id);
      CREATE INDEX idx_sources_source_type ON sources (source_type);
      CREATE INDEX idx_evidence_idea_id ON evidence (idea_id);
      CREATE INDEX idx_evidence_source_id ON evidence (source_id);
      CREATE INDEX idx_competitors_idea_id ON competitors (idea_id);
    `,
  },
  {
    id: POST_LAUNCH_MEASUREMENT_MIGRATION_ID,
    sql: `
      CREATE TABLE experiments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea_id INTEGER NOT NULL,
        report_id INTEGER,
        experiment_type TEXT NOT NULL,
        title TEXT NOT NULL,
        status TEXT NOT NULL,
        threshold_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        launched_at TEXT,
        completed_at TEXT,
        FOREIGN KEY (idea_id) REFERENCES ideas(id),
        FOREIGN KEY (report_id) REFERENCES reports(id)
      );

      CREATE TABLE experiment_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id INTEGER NOT NULL,
        event_name TEXT NOT NULL,
        occurred_at TEXT NOT NULL,
        source TEXT NOT NULL,
        session_id TEXT,
        metadata_json TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (experiment_id) REFERENCES experiments(id)
      );

      CREATE TABLE measurement_snapshots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id INTEGER NOT NULL,
        metrics_json TEXT NOT NULL,
        threshold_results_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (experiment_id) REFERENCES experiments(id)
      );

      CREATE TABLE experiment_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id INTEGER NOT NULL,
        decision TEXT NOT NULL,
        reason TEXT NOT NULL,
        report_id INTEGER,
        created_at TEXT NOT NULL,
        FOREIGN KEY (experiment_id) REFERENCES experiments(id),
        FOREIGN KEY (report_id) REFERENCES reports(id)
      );

      CREATE INDEX idx_experiments_idea_id ON experiments (idea_id);
      CREATE INDEX idx_experiments_report_id ON experiments (report_id);
      CREATE INDEX idx_experiment_events_experiment_id ON experiment_events (experiment_id);
      CREATE INDEX idx_experiment_events_event_name ON experiment_events (event_name);
      CREATE INDEX idx_measurement_snapshots_experiment_id ON measurement_snapshots (experiment_id);
      CREATE INDEX idx_experiment_decisions_experiment_id ON experiment_decisions (experiment_id);
      CREATE INDEX idx_experiment_decisions_report_id ON experiment_decisions (report_id);
    `,
  },
  {
    id: PIVOT_PERSEVERE_LOOP_MIGRATION_ID,
    sql: `
      CREATE TABLE idea_decisions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea_id INTEGER NOT NULL,
        experiment_id INTEGER,
        report_id INTEGER,
        decision TEXT NOT NULL,
        confidence TEXT NOT NULL,
        reason TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        next_action TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (idea_id) REFERENCES ideas(id),
        FOREIGN KEY (experiment_id) REFERENCES experiments(id),
        FOREIGN KEY (report_id) REFERENCES reports(id)
      );

      CREATE INDEX idx_idea_decisions_idea_id ON idea_decisions (idea_id);
      CREATE INDEX idx_idea_decisions_experiment_id ON idea_decisions (experiment_id);
      CREATE INDEX idx_idea_decisions_report_id ON idea_decisions (report_id);
    `,
  },
  {
    id: SCHEDULED_REVALIDATION_MIGRATION_ID,
    sql: `
      CREATE TABLE revalidation_rules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        evidence_type TEXT NOT NULL UNIQUE,
        stale_after_days INTEGER,
        task_type TEXT NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE revalidation_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea_id INTEGER,
        mode TEXT NOT NULL,
        status TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        summary_json TEXT,
        error_message TEXT,
        FOREIGN KEY (idea_id) REFERENCES ideas(id)
      );

      CREATE TABLE revalidation_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        idea_id INTEGER NOT NULL,
        task_type TEXT NOT NULL,
        status TEXT NOT NULL,
        reason TEXT NOT NULL,
        stale_reason_json TEXT,
        run_id INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        started_at TEXT,
        completed_at TEXT,
        error_message TEXT,
        FOREIGN KEY (idea_id) REFERENCES ideas(id),
        FOREIGN KEY (run_id) REFERENCES revalidation_runs(id)
      );

      INSERT INTO revalidation_rules (
        evidence_type,
        stale_after_days,
        task_type,
        enabled,
        created_at,
        updated_at
      ) VALUES
        ('autocomplete_prediction', 90, 'refresh_autocomplete', 1, datetime('now'), datetime('now')),
        ('serp_result', 30, 'refresh_serp', 1, datetime('now'), datetime('now')),
        ('competitor_pricing', 30, 'refresh_competitors', 1, datetime('now'), datetime('now')),
        ('reviews_complaints', 90, 'refresh_reviews', 1, datetime('now'), datetime('now')),
        ('measurement_event', NULL, 'refresh_measurement', 1, datetime('now'), datetime('now')),
        ('score_snapshot', NULL, 'refresh_score', 1, datetime('now'), datetime('now')),
        ('report_snapshot', NULL, 'refresh_report', 1, datetime('now'), datetime('now')),
        ('portfolio_snapshot', NULL, 'refresh_portfolio', 1, datetime('now'), datetime('now'));

      CREATE INDEX idx_revalidation_runs_idea_id ON revalidation_runs (idea_id);
      CREATE INDEX idx_revalidation_runs_status ON revalidation_runs (status);
      CREATE INDEX idx_revalidation_queue_idea_id ON revalidation_queue (idea_id);
      CREATE INDEX idx_revalidation_queue_status ON revalidation_queue (status);
      CREATE INDEX idx_revalidation_queue_task_type ON revalidation_queue (task_type);
      CREATE INDEX idx_revalidation_queue_run_id ON revalidation_queue (run_id);
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
