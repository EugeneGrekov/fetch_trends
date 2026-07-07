import type { DatabaseSync } from 'node:sqlite';
import { expectRow } from '../results.js';
import type { CreateToolRunInput, ToolRunRow } from '../schema.js';

export function createToolRun(db: DatabaseSync, input: CreateToolRunInput): ToolRunRow {
  const result = db.prepare(`
    INSERT INTO tool_runs (
      job_id,
      tool_name,
      input_json,
      output_json,
      metadata_json,
      status,
      started_at,
      completed_at,
      error_message
    ) VALUES (
      :jobId,
      :toolName,
      :inputJson,
      NULL,
      :metadataJson,
      :status,
      :startedAt,
      NULL,
      NULL
    )
  `).run({
    jobId: input.jobId,
    toolName: input.toolName,
    inputJson: input.inputJson,
    metadataJson: input.metadataJson ?? null,
    status: input.status,
    startedAt: input.startedAt,
  });

  return getToolRunById(db, Number(result.lastInsertRowid));
}

export function completeToolRun(
  db: DatabaseSync,
  id: number,
  outputJson: string,
  completedAt: string,
  metadataJson?: string,
): ToolRunRow {
  db.prepare(`
    UPDATE tool_runs
    SET status = 'completed',
        output_json = :outputJson,
        metadata_json = COALESCE(:metadataJson, metadata_json),
        completed_at = :completedAt,
        error_message = NULL
    WHERE id = :id
  `).run({ id, outputJson, completedAt, metadataJson: metadataJson ?? null });

  return getToolRunById(db, id);
}

export function failToolRun(
  db: DatabaseSync,
  id: number,
  errorMessage: string,
  completedAt: string,
  outputJson?: string,
  metadataJson?: string,
): ToolRunRow {
  db.prepare(`
    UPDATE tool_runs
    SET status = 'failed',
        output_json = COALESCE(:outputJson, output_json),
        metadata_json = COALESCE(:metadataJson, metadata_json),
        completed_at = :completedAt,
        error_message = :errorMessage
    WHERE id = :id
  `).run({
    id,
    outputJson: outputJson ?? null,
    metadataJson: metadataJson ?? null,
    completedAt,
    errorMessage,
  });

  return getToolRunById(db, id);
}

export function blockToolRun(
  db: DatabaseSync,
  id: number,
  errorMessage: string,
  completedAt: string,
  outputJson?: string,
  metadataJson?: string,
): ToolRunRow {
  db.prepare(`
    UPDATE tool_runs
    SET status = 'blocked',
        output_json = COALESCE(:outputJson, output_json),
        metadata_json = COALESCE(:metadataJson, metadata_json),
        completed_at = :completedAt,
        error_message = :errorMessage
    WHERE id = :id
  `).run({
    id,
    outputJson: outputJson ?? null,
    metadataJson: metadataJson ?? null,
    completedAt,
    errorMessage,
  });

  return getToolRunById(db, id);
}

export function getToolRunById(db: DatabaseSync, id: number): ToolRunRow {
  return expectRow<ToolRunRow>(
    db.prepare('SELECT * FROM tool_runs WHERE id = ?').get(id),
    `Tool run ${id} was not found.`,
  );
}
