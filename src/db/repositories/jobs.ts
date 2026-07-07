import type { DatabaseSync } from 'node:sqlite';
import { expectRow } from '../results.js';
import type { CreateJobInput, JobRow } from '../schema.js';

export function createJob(db: DatabaseSync, input: CreateJobInput): JobRow {
  const result = db.prepare(`
    INSERT INTO jobs (
      idea_id,
      job_type,
      status,
      started_at,
      completed_at,
      error_message
    ) VALUES (
      :ideaId,
      :jobType,
      :status,
      :startedAt,
      NULL,
      NULL
    )
  `).run({
    ideaId: input.ideaId,
    jobType: input.jobType,
    status: input.status,
    startedAt: input.startedAt ?? null,
  });

  return getJobById(db, Number(result.lastInsertRowid));
}

export function completeJob(db: DatabaseSync, id: number, completedAt: string): JobRow {
  db.prepare(`
    UPDATE jobs
    SET status = 'completed',
        completed_at = :completedAt,
        error_message = NULL
    WHERE id = :id
  `).run({ id, completedAt });

  return getJobById(db, id);
}

export function failJob(db: DatabaseSync, id: number, errorMessage: string, completedAt: string): JobRow {
  db.prepare(`
    UPDATE jobs
    SET status = 'failed',
        completed_at = :completedAt,
        error_message = :errorMessage
    WHERE id = :id
  `).run({ id, completedAt, errorMessage });

  return getJobById(db, id);
}

export function getJobById(db: DatabaseSync, id: number): JobRow {
  return expectRow<JobRow>(db.prepare('SELECT * FROM jobs WHERE id = ?').get(id), `Job ${id} was not found.`);
}
