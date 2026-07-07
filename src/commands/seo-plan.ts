import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import type { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { listAutocompletePredictionsByIdea } from '../db/repositories/autocomplete-predictions.js';
import { listCompetitorsByIdea } from '../db/repositories/competitors.js';
import { listEvidenceByIdea } from '../db/repositories/evidence.js';
import { getIdeaById } from '../db/repositories/ideas.js';
import { listQueriesByIdea } from '../db/repositories/queries.js';
import { createReport, listReportsByIdea } from '../db/repositories/reports.js';
import { listScoresByIdea } from '../db/repositories/scores.js';
import { listSourcesByIdea } from '../db/repositories/sources.js';
import type { ReportRow } from '../db/schema.js';
import { generateSeoPlan } from '../validation/seo-plan-generator.js';

export interface SeoPlanCommandOptions {
  dbPath?: string;
  ideaId: number;
  outDir?: string;
}

export interface GeneratedSeoPlanArtifact {
  jsonPath: string;
  markdownPath: string;
  report: ReportRow;
}

const DEFAULT_ARTIFACT_ROOT = './artifacts/ideas';
const REPORT_TYPE = 'seo_plan';

export function buildSeoPlanProgram(): Command {
  return new Command()
    .name('fetch-trends-seo-plan')
    .description('Generate an evidence-backed SEO page plan from stored validation evidence.')
    .requiredOption('--idea-id <id>', 'idea ID to generate from', parsePositiveInteger)
    .option('--db <path>', 'SQLite database path')
    .option('--outDir <path>', 'artifact root directory', DEFAULT_ARTIFACT_ROOT)
    .action(async (options: {
      db?: string;
      ideaId: number;
      outDir: string;
    }) => {
      try {
        const result = await generateSeoPlanArtifact({
          dbPath: options.db,
          ideaId: options.ideaId,
          outDir: options.outDir,
        });

        process.stdout.write('Generated SEO plan:\n');
        process.stdout.write(`Report ID: ${result.report.id}\n`);
        process.stdout.write(`Markdown: ${result.markdownPath}\n`);
        process.stdout.write(`JSON: ${result.jsonPath}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Error: ${message}\n`);
        process.exitCode = 1;
      }
    });
}

export async function runSeoPlanCli(argv: string[]): Promise<void> {
  await buildSeoPlanProgram().parseAsync(argv);
}

export async function generateSeoPlanArtifact(options: SeoPlanCommandOptions): Promise<GeneratedSeoPlanArtifact> {
  const { db } = await openDatabase(options.dbPath);
  try {
    applyMigrations(db);
    const sourceReport = latestValidationReport(db, options.ideaId);
    const generation = generateSeoPlan({
      competitors: listCompetitorsByIdea(db, options.ideaId),
      evidence: listEvidenceByIdea(db, options.ideaId),
      idea: getIdeaById(db, options.ideaId),
      predictions: listAutocompletePredictionsByIdea(db, options.ideaId),
      queries: listQueriesByIdea(db, options.ideaId),
      score: listScoresByIdea(db, options.ideaId)[0] ?? null,
      sources: listSourcesByIdea(db, options.ideaId),
    });
    const createdAt = new Date().toISOString();
    const report = createReport(db, {
      ideaId: options.ideaId,
      jobId: sourceReport.job_id,
      reportType: REPORT_TYPE,
      markdown: generation.markdown,
      json: JSON.stringify({ seoPlan: generation.plan }, null, 2),
      createdAt,
    });
    const artifactDir = join(options.outDir ?? DEFAULT_ARTIFACT_ROOT, String(options.ideaId));
    const markdownPath = join(artifactDir, 'seo-plan.md');
    const jsonPath = join(artifactDir, 'seo-plan.json');

    await mkdir(artifactDir, { recursive: true });
    await writeFile(markdownPath, `${generation.markdown}\n`);
    await writeFile(
      jsonPath,
      `${JSON.stringify({
        report: {
          id: report.id,
          ideaId: report.idea_id,
          jobId: report.job_id,
          reportType: report.report_type,
          createdAt: report.created_at,
        },
        sourceReportId: sourceReport.id,
        seoPlan: generation.plan,
      }, null, 2)}\n`,
    );

    return {
      jsonPath,
      markdownPath,
      report,
    };
  } finally {
    db.close();
  }
}

function latestValidationReport(db: DatabaseSync, ideaId: number): ReportRow {
  const report = listReportsByIdea(db, ideaId).find((item) => item.report_type === 'search-language-validation');
  if (!report) {
    throw new Error(`No stored search-language-validation report found for idea ${ideaId}. Run validation first.`);
  }

  return report;
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new InvalidArgumentError('Expected a positive integer.');
}
