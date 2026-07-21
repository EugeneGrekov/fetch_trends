import type { DatabaseSync } from 'node:sqlite';
import { expectRows } from '../db/results.js';
import type {
  AutocompleteBridgeJob,
  AutocompleteBridgeJobRow,
  NormalizedAutocompleteRequest,
} from './types.js';

export interface CreateOrGetBridgeJobResult {
  created: boolean;
  job: AutocompleteBridgeJob;
}

export function createOrGetBridgeJob(
  db: DatabaseSync,
  request: NormalizedAutocompleteRequest,
  createdBy: string,
  now: string,
): CreateOrGetBridgeJobResult {
  const existing = findBridgeJobByRequestKey(db, request.requestKey);
  if (existing) {
    return { created: false, job: existing };
  }

  try {
    const result = db.prepare(`
      INSERT INTO autocomplete_bridge_jobs (
        request_key,
        created_by,
        seeds_json,
        modifiers_json,
        status,
        output_path,
        result_markdown,
        error_message,
        created_at,
        updated_at,
        started_at,
        completed_at
      ) VALUES (
        :requestKey,
        :createdBy,
        :seedsJson,
        :modifiersJson,
        'queued',
        NULL,
        NULL,
        NULL,
        :now,
        :now,
        NULL,
        NULL
      )
    `).run({
      requestKey: request.requestKey,
      createdBy,
      seedsJson: JSON.stringify(request.seeds),
      modifiersJson: JSON.stringify(request.modifiers),
      now,
    });

    return {
      created: true,
      job: getBridgeJob(db, Number(result.lastInsertRowid)),
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const racedJob = findBridgeJobByRequestKey(db, request.requestKey);
      if (racedJob) {
        return { created: false, job: racedJob };
      }
    }

    throw error;
  }
}

export function findBridgeJob(db: DatabaseSync, id: number): AutocompleteBridgeJob | undefined {
  const row = db.prepare('SELECT * FROM autocomplete_bridge_jobs WHERE id = ?').get(id);
  return row ? mapBridgeJob(row as unknown as AutocompleteBridgeJobRow) : undefined;
}

export function getBridgeJob(db: DatabaseSync, id: number): AutocompleteBridgeJob {
  const job = findBridgeJob(db, id);
  if (!job) {
    throw new Error(`Autocomplete bridge job ${id} was not found.`);
  }

  return job;
}

export function findBridgeJobByRequestKey(
  db: DatabaseSync,
  requestKey: string,
): AutocompleteBridgeJob | undefined {
  const row = db.prepare('SELECT * FROM autocomplete_bridge_jobs WHERE request_key = ?').get(requestKey);
  return row ? mapBridgeJob(row as unknown as AutocompleteBridgeJobRow) : undefined;
}

export function listBridgeJobs(db: DatabaseSync, limit = 50): AutocompleteBridgeJob[] {
  const rows = expectRows<AutocompleteBridgeJobRow>(db.prepare(`
    SELECT *
    FROM autocomplete_bridge_jobs
    ORDER BY id DESC
    LIMIT :limit
  `).all({ limit }));

  return rows.map(mapBridgeJob);
}

export function findNextQueuedBridgeJob(db: DatabaseSync): AutocompleteBridgeJob | undefined {
  const row = db.prepare(`
    SELECT *
    FROM autocomplete_bridge_jobs
    WHERE status = 'queued'
    ORDER BY id ASC
    LIMIT 1
  `).get();

  return row ? mapBridgeJob(row as unknown as AutocompleteBridgeJobRow) : undefined;
}

export function hasProcessingBridgeJob(db: DatabaseSync): boolean {
  const row = db.prepare(`
    SELECT id
    FROM autocomplete_bridge_jobs
    WHERE status = 'processing'
    LIMIT 1
  `).get();

  return Boolean(row);
}

export function startBridgeJob(
  db: DatabaseSync,
  id: number,
  startedAt: string,
  outputPath: string,
): AutocompleteBridgeJob {
  const result = db.prepare(`
    UPDATE autocomplete_bridge_jobs
    SET status = 'processing',
        output_path = :outputPath,
        result_markdown = NULL,
        error_message = NULL,
        started_at = :startedAt,
        completed_at = NULL,
        updated_at = :startedAt
    WHERE id = :id AND status = 'queued'
  `).run({ id, outputPath, startedAt });

  if (Number(result.changes) !== 1) {
    throw new Error(`Autocomplete bridge job ${id} is not queued.`);
  }

  return getBridgeJob(db, id);
}

export function completeBridgeJob(
  db: DatabaseSync,
  id: number,
  markdown: string,
  outputPath: string,
  completedAt: string,
): AutocompleteBridgeJob {
  const result = db.prepare(`
    UPDATE autocomplete_bridge_jobs
    SET status = 'completed',
        output_path = :outputPath,
        result_markdown = :markdown,
        error_message = NULL,
        completed_at = :completedAt,
        updated_at = :completedAt
    WHERE id = :id AND status = 'processing'
  `).run({ id, markdown, outputPath, completedAt });

  if (Number(result.changes) !== 1) {
    throw new Error(`Autocomplete bridge job ${id} is not processing.`);
  }

  return getBridgeJob(db, id);
}

export function failBridgeJob(
  db: DatabaseSync,
  id: number,
  errorMessage: string,
  completedAt: string,
): AutocompleteBridgeJob {
  const result = db.prepare(`
    UPDATE autocomplete_bridge_jobs
    SET status = 'failed',
        result_markdown = NULL,
        error_message = :errorMessage,
        completed_at = :completedAt,
        updated_at = :completedAt
    WHERE id = :id AND status = 'processing'
  `).run({ id, errorMessage, completedAt });

  if (Number(result.changes) !== 1) {
    throw new Error(`Autocomplete bridge job ${id} is not processing.`);
  }

  return getBridgeJob(db, id);
}

export function retryBridgeJob(db: DatabaseSync, id: number, now: string): AutocompleteBridgeJob {
  const result = db.prepare(`
    UPDATE autocomplete_bridge_jobs
    SET status = 'queued',
        result_markdown = NULL,
        error_message = NULL,
        started_at = NULL,
        completed_at = NULL,
        updated_at = :now
    WHERE id = :id AND status = 'failed'
  `).run({ id, now });

  if (Number(result.changes) !== 1) {
    const existing = findBridgeJob(db, id);
    if (!existing) {
      throw new Error(`Autocomplete bridge job ${id} was not found.`);
    }

    throw new Error(`Autocomplete bridge job ${id} is not failed.`);
  }

  return getBridgeJob(db, id);
}

export function failInterruptedBridgeJobs(
  db: DatabaseSync,
  completedAt: string,
  message = 'Interrupted by backend restart. Use Retry to continue.',
): number {
  const result = db.prepare(`
    UPDATE autocomplete_bridge_jobs
    SET status = 'failed',
        result_markdown = NULL,
        error_message = :message,
        completed_at = :completedAt,
        updated_at = :completedAt
    WHERE status = 'processing'
  `).run({ completedAt, message });

  return Number(result.changes);
}

function mapBridgeJob(row: AutocompleteBridgeJobRow): AutocompleteBridgeJob {
  return {
    id: row.id,
    requestKey: row.request_key,
    createdBy: row.created_by,
    seeds: parseStringArray(row.seeds_json),
    modifiers: parseStringArray(row.modifiers_json),
    status: row.status,
    outputPath: row.output_path,
    resultMarkdown: row.result_markdown,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function parseStringArray(value: string): string[] {
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || !parsed.every((item) => typeof item === 'string')) {
    throw new Error('Stored autocomplete bridge rows are invalid.');
  }

  return parsed;
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Error && /unique constraint/i.test(error.message);
}
