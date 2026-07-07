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
import { createReport, listReportsByIdea } from '../db/repositories/reports.js';
import { listScoresByIdea } from '../db/repositories/scores.js';
import { listSourcesByIdea } from '../db/repositories/sources.js';
import type { ReportRow } from '../db/schema.js';
import { generatePaymentTest } from '../validation/payment-test-generator.js';

export interface PaymentTestCommandOptions {
  dbPath?: string;
  ideaId: number;
  outDir?: string;
}

export interface GeneratedPaymentTestArtifact {
  jsonPath: string;
  markdownPath: string;
  report: ReportRow;
}

const DEFAULT_ARTIFACT_ROOT = './artifacts/ideas';
const REPORT_TYPE = 'payment_test_spec';

export function buildPaymentTestProgram(): Command {
  return new Command()
    .name('fetch-trends-payment-test')
    .description('Generate a payment-intent test spec from stored validation evidence.')
    .requiredOption('--idea-id <id>', 'idea ID to generate from', parsePositiveInteger)
    .option('--db <path>', 'SQLite database path')
    .option('--outDir <path>', 'artifact root directory', DEFAULT_ARTIFACT_ROOT)
    .action(async (options: {
      db?: string;
      ideaId: number;
      outDir: string;
    }) => {
      try {
        const result = await generatePaymentTestArtifact({
          dbPath: options.db,
          ideaId: options.ideaId,
          outDir: options.outDir,
        });

        process.stdout.write('Generated payment test spec:\n');
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

export async function runPaymentTestCli(argv: string[]): Promise<void> {
  await buildPaymentTestProgram().parseAsync(argv);
}

export async function generatePaymentTestArtifact(options: PaymentTestCommandOptions): Promise<GeneratedPaymentTestArtifact> {
  const { db } = await openDatabase(options.dbPath);
  try {
    applyMigrations(db);
    const input = loadPaymentTestInput(db, options.ideaId);
    const generation = generatePaymentTest(input);
    const createdAt = new Date().toISOString();
    const report = createReport(db, {
      ideaId: options.ideaId,
      jobId: input.report.job_id,
      reportType: REPORT_TYPE,
      markdown: generation.markdown,
      json: JSON.stringify({ paymentTest: generation.spec }, null, 2),
      createdAt,
    });
    const artifactDir = join(options.outDir ?? DEFAULT_ARTIFACT_ROOT, String(options.ideaId));
    const markdownPath = join(artifactDir, 'payment-test.md');
    const jsonPath = join(artifactDir, 'payment-test.json');

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
        sourceReportId: input.report.id,
        paymentTest: generation.spec,
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

function loadPaymentTestInput(db: DatabaseSync, ideaId: number): Parameters<typeof generatePaymentTest>[0] {
  const idea = getIdeaById(db, ideaId);
  const report = latestValidationReport(db, ideaId);
  return {
    competitors: listCompetitorsByIdea(db, ideaId),
    evidence: listEvidenceByIdea(db, ideaId),
    idea,
    predictions: listAutocompletePredictionsByIdea(db, ideaId),
    report,
    score: listScoresByIdea(db, ideaId)[0] ?? null,
    sources: listSourcesByIdea(db, ideaId),
  };
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
