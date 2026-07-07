import type { DatabaseSync } from 'node:sqlite';
import { expectRow, expectRows } from '../results.js';
import type {
  CreateRevalidationQueueInput,
  CreateRevalidationRunInput,
  RevalidationQueueRow,
  RevalidationRuleRow,
  RevalidationRunRow,
} from '../schema.js';

export function listRevalidationRules(db: DatabaseSync): RevalidationRuleRow[] {
  return expectRows<RevalidationRuleRow>(
    db.prepare(`
      SELECT *
      FROM revalidation_rules
      ORDER BY id ASC
    `).all(),
  );
}

export function createRevalidationRun(db: DatabaseSync, input: CreateRevalidationRunInput): RevalidationRunRow {
  const result = db.prepare(`
    INSERT INTO revalidation_runs (
      idea_id,
      mode,
      status,
      started_at,
      completed_at,
      summary_json,
      error_message
    ) VALUES (
      :ideaId,
      :mode,
      :status,
      :startedAt,
      NULL,
      NULL,
      NULL
    )
  `).run({
    ideaId: input.ideaId ?? null,
    mode: input.mode,
    status: input.status,
    startedAt: input.startedAt,
  });

  return getRevalidationRunById(db, Number(result.lastInsertRowid));
}

export function completeRevalidationRun(
  db: DatabaseSync,
  id: number,
  summaryJson: string,
  completedAt: string,
): RevalidationRunRow {
  db.prepare(`
    UPDATE revalidation_runs
    SET status = 'completed',
        completed_at = :completedAt,
        summary_json = :summaryJson,
        error_message = NULL
    WHERE id = :id
  `).run({ id, summaryJson, completedAt });

  return getRevalidationRunById(db, id);
}

export function failRevalidationRun(
  db: DatabaseSync,
  id: number,
  errorMessage: string,
  summaryJson: string | null,
  completedAt: string,
): RevalidationRunRow {
  db.prepare(`
    UPDATE revalidation_runs
    SET status = 'failed',
        completed_at = :completedAt,
        summary_json = COALESCE(:summaryJson, summary_json),
        error_message = :errorMessage
    WHERE id = :id
  `).run({ id, summaryJson, completedAt, errorMessage });

  return getRevalidationRunById(db, id);
}

export function getRevalidationRunById(db: DatabaseSync, id: number): RevalidationRunRow {
  return expectRow<RevalidationRunRow>(
    db.prepare('SELECT * FROM revalidation_runs WHERE id = ?').get(id),
    `Revalidation run ${id} was not found.`,
  );
}

export function listRevalidationRuns(db: DatabaseSync, limit = 25): RevalidationRunRow[] {
  return expectRows<RevalidationRunRow>(
    db.prepare(`
      SELECT *
      FROM revalidation_runs
      ORDER BY id DESC
      LIMIT :limit
    `).all({ limit }),
  );
}

export function createRevalidationQueueItem(
  db: DatabaseSync,
  input: CreateRevalidationQueueInput,
): RevalidationQueueRow {
  const result = db.prepare(`
    INSERT INTO revalidation_queue (
      idea_id,
      task_type,
      status,
      reason,
      stale_reason_json,
      run_id,
      created_at,
      updated_at,
      started_at,
      completed_at,
      error_message
    ) VALUES (
      :ideaId,
      :taskType,
      'pending',
      :reason,
      :staleReasonJson,
      NULL,
      :createdAt,
      :createdAt,
      NULL,
      NULL,
      NULL
    )
  `).run({
    ideaId: input.ideaId,
    taskType: input.taskType,
    reason: input.reason,
    staleReasonJson: input.staleReasonJson ?? null,
    createdAt: input.createdAt,
  });

  return getRevalidationQueueItemById(db, Number(result.lastInsertRowid));
}

export function getRevalidationQueueItemById(db: DatabaseSync, id: number): RevalidationQueueRow {
  return expectRow<RevalidationQueueRow>(
    db.prepare('SELECT * FROM revalidation_queue WHERE id = ?').get(id),
    `Revalidation queue item ${id} was not found.`,
  );
}

export function findOpenRevalidationQueueItem(
  db: DatabaseSync,
  ideaId: number,
  taskType: string,
): RevalidationQueueRow | null {
  const row = db.prepare(`
    SELECT *
    FROM revalidation_queue
    WHERE idea_id = :ideaId
      AND task_type = :taskType
      AND status IN ('pending', 'running')
    ORDER BY id DESC
    LIMIT 1
  `).get({ ideaId, taskType });

  return row ? row as unknown as RevalidationQueueRow : null;
}

export function listRevalidationQueueByIdea(db: DatabaseSync, ideaId: number): RevalidationQueueRow[] {
  return expectRows<RevalidationQueueRow>(
    db.prepare(`
      SELECT *
      FROM revalidation_queue
      WHERE idea_id = :ideaId
      ORDER BY id ASC
    `).all({ ideaId }),
  );
}

export function listPendingRevalidationQueue(
  db: DatabaseSync,
  options: { ideaId?: number; limit?: number } = {},
): RevalidationQueueRow[] {
  const limit = options.limit ?? 25;
  if (options.ideaId != null) {
    return expectRows<RevalidationQueueRow>(
      db.prepare(`
        SELECT *
        FROM revalidation_queue
        WHERE status = 'pending'
          AND idea_id = :ideaId
        ORDER BY id ASC
        LIMIT :limit
      `).all({ ideaId: options.ideaId, limit }),
    );
  }

  return expectRows<RevalidationQueueRow>(
    db.prepare(`
      SELECT *
      FROM revalidation_queue
      WHERE status = 'pending'
      ORDER BY id ASC
      LIMIT :limit
    `).all({ limit }),
  );
}

export function startRevalidationQueueItem(
  db: DatabaseSync,
  id: number,
  runId: number,
  startedAt: string,
): RevalidationQueueRow {
  db.prepare(`
    UPDATE revalidation_queue
    SET status = 'running',
        run_id = :runId,
        started_at = :startedAt,
        completed_at = NULL,
        updated_at = :startedAt,
        error_message = NULL
    WHERE id = :id
  `).run({ id, runId, startedAt });

  return getRevalidationQueueItemById(db, id);
}

export function completeRevalidationQueueItem(
  db: DatabaseSync,
  id: number,
  completedAt: string,
): RevalidationQueueRow {
  return setQueueTerminalStatus(db, id, 'completed', null, completedAt);
}

export function failRevalidationQueueItem(
  db: DatabaseSync,
  id: number,
  errorMessage: string,
  completedAt: string,
): RevalidationQueueRow {
  return setQueueTerminalStatus(db, id, 'failed', errorMessage, completedAt);
}

export function blockRevalidationQueueItem(
  db: DatabaseSync,
  id: number,
  errorMessage: string,
  completedAt: string,
): RevalidationQueueRow {
  return setQueueTerminalStatus(db, id, 'blocked', errorMessage, completedAt);
}

export function skipRevalidationQueueItem(
  db: DatabaseSync,
  id: number,
  message: string,
  completedAt: string,
): RevalidationQueueRow {
  return setQueueTerminalStatus(db, id, 'skipped', message, completedAt);
}

function setQueueTerminalStatus(
  db: DatabaseSync,
  id: number,
  status: 'completed' | 'failed' | 'skipped' | 'blocked',
  errorMessage: string | null,
  completedAt: string,
): RevalidationQueueRow {
  db.prepare(`
    UPDATE revalidation_queue
    SET status = :status,
        completed_at = :completedAt,
        updated_at = :completedAt,
        error_message = :errorMessage
    WHERE id = :id
  `).run({ id, status, completedAt, errorMessage });

  return getRevalidationQueueItemById(db, id);
}
