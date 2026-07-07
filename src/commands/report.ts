#!/usr/bin/env node
import { writeFile } from 'node:fs/promises';
import { Command, InvalidArgumentError } from 'commander';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { listReportsByIdea, listReportsByJob } from '../db/repositories/reports.js';
import type { ReportRow } from '../db/schema.js';

type ReportFormat = 'markdown' | 'json';

const program = new Command();

program
  .name('fetch-trends-report')
  .description('Read a stored validation report from SQLite and print or export it.')
  .option('--db <path>', 'SQLite database path')
  .option('--idea-id <id>', 'load the latest report for an idea', parsePositiveInteger)
  .option('--job-id <id>', 'load the latest report for a job', parsePositiveInteger)
  .option('--format <format>', 'output format: markdown or json', parseFormat, 'markdown')
  .option('--out <path>', 'write the selected report to a file instead of stdout')
  .action(async (options: {
    db?: string;
    ideaId?: number;
    jobId?: number;
    format: ReportFormat;
    out?: string;
  }) => {
    try {
      validateSelection(options.ideaId, options.jobId);

      const { db } = await openDatabase(options.db);
      try {
        applyMigrations(db);
        const report = selectReport(db, options.ideaId, options.jobId);
        const rendered = renderReport(report, options.format);

        if (options.out) {
          await writeFile(options.out, `${rendered}\n`);
          process.stdout.write(`Wrote report ${report.id} to ${options.out}\n`);
          return;
        }

        process.stdout.write(rendered);
        if (!rendered.endsWith('\n')) {
          process.stdout.write('\n');
        }
      } finally {
        db.close();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);

function validateSelection(ideaId?: number, jobId?: number): void {
  if ((ideaId == null && jobId == null) || (ideaId != null && jobId != null)) {
    throw new Error('Pass exactly one of --idea-id or --job-id.');
  }
}

function selectReport(db: Parameters<typeof listReportsByIdea>[0], ideaId?: number, jobId?: number): ReportRow {
  if (ideaId != null) {
    const latest = listReportsByIdea(db, ideaId)[0];
    if (!latest) {
      throw new Error(`No stored report found for idea ${ideaId}.`);
    }

    return latest;
  }

  const latest = listReportsByJob(db, jobId as number)[0];
  if (!latest) {
    throw new Error(`No stored report found for job ${jobId}.`);
  }

  return latest;
}

function renderReport(report: ReportRow, format: ReportFormat): string {
  if (format === 'markdown') {
    return report.markdown;
  }

  return JSON.stringify(
    {
      report: {
        id: report.id,
        ideaId: report.idea_id,
        jobId: report.job_id,
        reportType: report.report_type,
        createdAt: report.created_at,
      },
      markdown: report.markdown,
      structured: parseStructuredReport(report.json),
    },
    null,
    2,
  );
}

function parseFormat(value: string): ReportFormat {
  if (value === 'markdown' || value === 'json') {
    return value;
  }

  throw new InvalidArgumentError('Expected --format to be markdown or json.');
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new InvalidArgumentError('Expected a positive integer.');
}

function parseStructuredReport(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
