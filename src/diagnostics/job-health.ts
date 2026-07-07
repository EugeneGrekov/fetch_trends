import type { DatabaseSync } from 'node:sqlite';
import type { DiagnosticCheck, DiagnosticContext } from './types.js';
import { hasTable, inspectDatabaseFile, openReadonlyDatabase } from './sqlite.js';

const STALE_RUNNING_MS = 2 * 60 * 60 * 1000;
const STALE_PENDING_MS = 24 * 60 * 60 * 1000;
const SAMPLE_LIMIT = 10;

export async function checkJobHealth(context: DiagnosticContext): Promise<DiagnosticCheck[]> {
  const fileState = await inspectDatabaseFile(context.dbPath);
  if (!fileState.exists || !fileState.readable) {
    return [
      skippedJobCheck('jobs.failed', 'Failed jobs', 'Job checks skipped because the DB file is unavailable.'),
      skippedJobCheck('jobs.stale_running', 'Stale running jobs', 'Running job age checks skipped because the DB file is unavailable.'),
      skippedJobCheck('jobs.stale_pending', 'Stale pending jobs', 'Pending job age checks skipped because the DB file is unavailable.'),
      skippedJobCheck('jobs.tool_run_errors', 'Tool run errors', 'Tool run checks skipped because the DB file is unavailable.'),
      skippedJobCheck('jobs.without_reports', 'Completed jobs without reports', 'Report linkage checks skipped because the DB file is unavailable.'),
    ];
  }

  let db: DatabaseSync;
  try {
    db = openReadonlyDatabase(context.dbPath);
  } catch (error) {
    return [
      {
        id: 'jobs.open',
        label: 'Job database open',
        category: 'jobs',
        status: 'fail',
        message: 'SQLite database could not be opened for job diagnostics.',
        details: {
          errorMessage: error instanceof Error ? error.message : String(error),
        },
      },
    ];
  }

  try {
    if (!hasTable(db, 'jobs')) {
      return [
        skippedJobCheck('jobs.failed', 'Failed jobs', 'Job checks skipped because the jobs table is missing.'),
        skippedJobCheck('jobs.stale_running', 'Stale running jobs', 'Running job checks skipped because the jobs table is missing.'),
        skippedJobCheck('jobs.stale_pending', 'Stale pending jobs', 'Pending job checks skipped because the jobs table is missing.'),
        skippedJobCheck('jobs.tool_run_errors', 'Tool run errors', 'Tool run checks skipped because the jobs table is missing.'),
        skippedJobCheck('jobs.without_reports', 'Completed jobs without reports', 'Report linkage checks skipped because the jobs table is missing.'),
      ];
    }

    return [
      failedJobsCheck(db),
      staleRunningJobsCheck(db, context.generatedAt),
      stalePendingJobsCheck(db, context.generatedAt),
      toolRunErrorCheck(db),
      jobsWithoutReportsCheck(db),
    ];
  } finally {
    db.close();
  }
}

function skippedJobCheck(id: string, label: string, message: string): DiagnosticCheck {
  return {
    id,
    label,
    category: 'jobs',
    status: 'skip',
    message,
  };
}

function failedJobsCheck(db: DatabaseSync): DiagnosticCheck {
  const rows = db.prepare(`
    SELECT id, idea_id, job_type, status, completed_at, error_message
    FROM jobs
    WHERE status = 'failed'
    ORDER BY completed_at DESC, id DESC
    LIMIT :limit
  `).all({ limit: SAMPLE_LIMIT }) as Array<Record<string, unknown>>;

  const count = countMatchingJobs(db, "status = 'failed'");
  return {
    id: 'jobs.failed',
    label: 'Failed jobs',
    category: 'jobs',
    status: count === 0 ? 'pass' : 'warn',
    message: count === 0
      ? 'No failed jobs were found.'
      : `${count} failed job(s) were found.`,
    details: {
      count,
      sample: rows,
    },
    nextAction: count === 0 ? undefined : 'Inspect the failed job detail and its tool_runs error_message values.',
  };
}

function staleRunningJobsCheck(db: DatabaseSync, now: Date): DiagnosticCheck {
  const rows = db.prepare(`
    SELECT id, idea_id, job_type, status, started_at
    FROM jobs
    WHERE status = 'running'
    ORDER BY id ASC
  `).all() as Array<{ id: number; idea_id: number; job_type: string; status: string; started_at: string | null }>;

  const stale = rows.filter((row) => isOlderThan(row.started_at, now, STALE_RUNNING_MS));
  return {
    id: 'jobs.stale_running',
    label: 'Stale running jobs',
    category: 'jobs',
    status: stale.length === 0 ? 'pass' : 'warn',
    message: stale.length === 0
      ? 'No running jobs are older than 2 hours.'
      : `${stale.length} running job(s) are older than 2 hours.`,
    details: {
      count: stale.length,
      sample: stale.slice(0, SAMPLE_LIMIT),
      thresholdHours: 2,
    },
    nextAction: stale.length === 0 ? undefined : 'Review whether the worker was interrupted before marking these jobs complete or failed.',
  };
}

function stalePendingJobsCheck(db: DatabaseSync, now: Date): DiagnosticCheck {
  if (!hasTable(db, 'ideas')) {
    return skippedJobCheck(
      'jobs.stale_pending',
      'Stale pending jobs',
      'Pending job age checks skipped because the ideas table is missing.',
    );
  }

  const rows = db.prepare(`
    SELECT jobs.id, jobs.idea_id, jobs.job_type, jobs.status, ideas.created_at AS queued_at
    FROM jobs
    LEFT JOIN ideas ON ideas.id = jobs.idea_id
    WHERE jobs.status = 'pending'
    ORDER BY jobs.id ASC
  `).all() as Array<{ id: number; idea_id: number; job_type: string; status: string; queued_at: string | null }>;

  const stale = rows.filter((row) => isOlderThan(row.queued_at, now, STALE_PENDING_MS));
  return {
    id: 'jobs.stale_pending',
    label: 'Stale pending jobs',
    category: 'jobs',
    status: stale.length === 0 ? 'pass' : 'warn',
    message: stale.length === 0
      ? 'No pending jobs are older than 24 hours.'
      : `${stale.length} pending job(s) are older than 24 hours.`,
    details: {
      count: stale.length,
      sample: stale.slice(0, SAMPLE_LIMIT),
      thresholdHours: 24,
    },
    nextAction: stale.length === 0 ? undefined : 'Run npm run worker or inspect why pending jobs are not being processed.',
  };
}

function toolRunErrorCheck(db: DatabaseSync): DiagnosticCheck {
  if (!hasTable(db, 'tool_runs')) {
    return skippedJobCheck('jobs.tool_run_errors', 'Tool run errors', 'Tool run checks skipped because the tool_runs table is missing.');
  }

  const rows = db.prepare(`
    SELECT id, job_id, tool_name, status, error_message
    FROM tool_runs
    WHERE status IN ('failed', 'blocked') OR error_message IS NOT NULL
    ORDER BY id DESC
    LIMIT :limit
  `).all({ limit: SAMPLE_LIMIT }) as Array<Record<string, unknown>>;

  const count = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM tool_runs
    WHERE status IN ('failed', 'blocked') OR error_message IS NOT NULL
  `).get() as { count: number }).count;

  return {
    id: 'jobs.tool_run_errors',
    label: 'Tool run errors',
    category: 'jobs',
    status: count === 0 ? 'pass' : 'warn',
    message: count === 0
      ? 'No failed or blocked tool runs were found.'
      : `${count} failed or blocked tool run(s) were found.`,
    details: {
      count,
      sample: rows,
    },
    nextAction: count === 0 ? undefined : 'Inspect tool_runs.error_message for provider, browser, or AI failures.',
  };
}

function jobsWithoutReportsCheck(db: DatabaseSync): DiagnosticCheck {
  if (!hasTable(db, 'reports')) {
    return skippedJobCheck(
      'jobs.without_reports',
      'Completed jobs without reports',
      'Report linkage checks skipped because the reports table is missing.',
    );
  }

  const rows = db.prepare(`
    SELECT jobs.id, jobs.idea_id, jobs.job_type, jobs.completed_at
    FROM jobs
    LEFT JOIN reports ON reports.job_id = jobs.id
    WHERE jobs.status = 'completed'
      AND jobs.job_type = 'validate'
      AND reports.id IS NULL
    ORDER BY jobs.completed_at DESC, jobs.id DESC
    LIMIT :limit
  `).all({ limit: SAMPLE_LIMIT }) as Array<Record<string, unknown>>;

  const count = (db.prepare(`
    SELECT COUNT(*) AS count
    FROM jobs
    LEFT JOIN reports ON reports.job_id = jobs.id
    WHERE jobs.status = 'completed'
      AND jobs.job_type = 'validate'
      AND reports.id IS NULL
  `).get() as { count: number }).count;

  return {
    id: 'jobs.without_reports',
    label: 'Completed jobs without reports',
    category: 'jobs',
    status: count === 0 ? 'pass' : 'warn',
    message: count === 0
      ? 'Every completed validation job has at least one report.'
      : `${count} completed validation job(s) have no report row.`,
    details: {
      count,
      sample: rows,
    },
    nextAction: count === 0 ? undefined : 'Regenerate reports or inspect the validation pipeline failure around report creation.',
  };
}

function countMatchingJobs(db: DatabaseSync, whereClause: string): number {
  const row = db.prepare(`SELECT COUNT(*) AS count FROM jobs WHERE ${whereClause}`).get() as { count: number };
  return row.count;
}

function isOlderThan(timestamp: string | null, now: Date, thresholdMs: number): boolean {
  if (!timestamp) {
    return false;
  }

  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return now.getTime() - parsed.getTime() > thresholdMs;
}
