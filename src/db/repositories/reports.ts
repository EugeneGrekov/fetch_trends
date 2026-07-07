import type { DatabaseSync } from 'node:sqlite';
import { expectRow, expectRows } from '../results.js';
import type { CreateReportInput, ReportRow } from '../schema.js';

export function createReport(db: DatabaseSync, input: CreateReportInput): ReportRow {
  const result = db.prepare(`
    INSERT INTO reports (
      idea_id,
      job_id,
      report_type,
      markdown,
      json,
      created_at
    ) VALUES (
      :ideaId,
      :jobId,
      :reportType,
      :markdown,
      :json,
      :createdAt
    )
  `).run({
    ideaId: input.ideaId,
    jobId: input.jobId ?? null,
    reportType: input.reportType,
    markdown: input.markdown,
    json: input.json ?? null,
    createdAt: input.createdAt,
  });

  return getReportById(db, Number(result.lastInsertRowid));
}

export function getReportById(db: DatabaseSync, id: number): ReportRow {
  return expectRow<ReportRow>(db.prepare('SELECT * FROM reports WHERE id = ?').get(id), `Report ${id} was not found.`);
}

export function listReportsByIdea(db: DatabaseSync, ideaId: number): ReportRow[] {
  return expectRows<ReportRow>(
    db.prepare(`
      SELECT *
      FROM reports
      WHERE idea_id = :ideaId
      ORDER BY created_at DESC, id DESC
    `).all({ ideaId }),
  );
}

export function listReportsByJob(db: DatabaseSync, jobId: number): ReportRow[] {
  return expectRows<ReportRow>(
    db.prepare(`
      SELECT *
      FROM reports
      WHERE job_id = :jobId
      ORDER BY created_at DESC, id DESC
    `).all({ jobId }),
  );
}
