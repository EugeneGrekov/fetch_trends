#!/usr/bin/env node
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Command, InvalidArgumentError } from 'commander';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { createPortfolioReportRow, buildPortfolioComparisonReport } from '../portfolio/comparison-report.js';
import { loadPortfolioIdeas } from '../portfolio/portfolio-loader.js';
import { rankPortfolioIdeas } from '../portfolio/portfolio-ranker.js';
import type { PortfolioComparisonFilters, PortfolioComparisonReport } from '../portfolio/types.js';

export interface PortfolioCommandOptions {
  dbPath?: string;
  includeKilled: boolean;
  limit: number;
  outDir?: string;
  status?: string;
}

export interface GeneratedPortfolioComparisonArtifact {
  markdownPath: string;
  jsonPath: string;
  report: {
    id: number;
    ideaId: number;
    reportType: string;
    createdAt: string;
  };
  comparison: PortfolioComparisonReport;
}

const DEFAULT_ARTIFACT_ROOT = './artifacts/portfolio';

export function buildPortfolioProgram(): Command {
  return new Command()
    .name('fetch-trends-portfolio')
    .description('Compare multiple stored ideas by evidence strength, risk, cost to test, and next action.')
    .option('--db <path>', 'SQLite database path')
    .option('--outDir <path>', 'artifact root directory', DEFAULT_ARTIFACT_ROOT)
    .option('--status <status>', 'filter ideas by status, or use "active" / "killed"')
    .option('--limit <count>', 'maximum number of ideas to compare', parsePositiveInteger, 20)
    .option('--include-killed <boolean>', 'include killed ideas in the comparison: true/false', parseBoolean, true)
    .action(async (options: {
      db?: string;
      includeKilled: boolean;
      limit: number;
      outDir: string;
      status?: string;
    }) => {
      try {
        const result = await generatePortfolioComparisonArtifact({
          dbPath: options.db,
          includeKilled: options.includeKilled,
          limit: options.limit,
          outDir: options.outDir,
          status: options.status,
        });

        process.stdout.write('Portfolio report generated:\n');
        process.stdout.write(`Report ID: ${result.report.id}\n`);
        process.stdout.write(`Markdown: ${result.markdownPath}\n`);
        process.stdout.write(`JSON: ${result.jsonPath}\n`);
        process.stdout.write(`Top next action: ${result.comparison.json.summary.topNextAction}\n`);
        process.stdout.write('Top ideas:\n');
        for (const idea of result.comparison.json.rankedIdeas.slice(0, 3)) {
          process.stdout.write(`- ${idea.title} | ${idea.bucket} | ${idea.portfolioScore}/100\n`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Error: ${message}\n`);
        process.exitCode = 1;
      }
    });
}

export async function runPortfolioCli(argv: string[]): Promise<void> {
  await buildPortfolioProgram().parseAsync(argv);
}

export async function generatePortfolioComparisonArtifact(
  options: PortfolioCommandOptions & { createdAt?: string },
): Promise<GeneratedPortfolioComparisonArtifact> {
  const createdAt = options.createdAt ?? new Date().toISOString();
  const { db } = await openDatabase(options.dbPath);
  try {
    applyMigrations(db);
    const filters: PortfolioComparisonFilters = {
      includeKilled: options.includeKilled,
      limit: options.limit,
      status: options.status ?? null,
    };
    const snapshots = loadPortfolioIdeas(db, filters);
    if (snapshots.length === 0) {
      throw new Error('No ideas matched the current filters.');
    }

    const rankedIdeas = rankPortfolioIdeas(snapshots, createdAt);
    const ideaIds = rankedIdeas.map((idea) => idea.ideaId);
    const comparison = buildPortfolioComparisonReport({
      filters,
      generatedAt: createdAt,
      ideaIds,
      rankedIdeas,
    });
    const report = createPortfolioReportRow(db, {
      createdAt,
      ideaId: rankedIdeas[0].ideaId,
      json: comparison.json,
      markdown: comparison.markdown,
    });

    const finalJson = {
      ...comparison.json,
      report: {
        ...comparison.json.report,
        createdAt: report.created_at,
        id: report.id,
        ideaId: report.idea_id,
      },
    };

    db.prepare('UPDATE reports SET json = :json WHERE id = :id').run({
      id: report.id,
      json: JSON.stringify(finalJson, null, 2),
    });

    const finalComparison: PortfolioComparisonReport = {
      json: finalJson,
      markdown: comparison.markdown,
    };

    const artifactDir = join(options.outDir ?? DEFAULT_ARTIFACT_ROOT);
    const markdownPath = join(artifactDir, `portfolio-comparison-${report.id}.md`);
    const jsonPath = join(artifactDir, `portfolio-comparison-${report.id}.json`);

    await mkdir(artifactDir, { recursive: true });
    await writeFile(markdownPath, `${finalComparison.markdown}\n`);
    await writeFile(jsonPath, `${JSON.stringify(finalJson, null, 2)}\n`);

    return {
      comparison: finalComparison,
      jsonPath,
      markdownPath,
      report: {
        createdAt: report.created_at,
        id: report.id,
        ideaId: report.idea_id,
        reportType: report.report_type,
      },
    };
  } finally {
    db.close();
  }
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }

  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }

  throw new InvalidArgumentError('Expected a boolean value: true or false.');
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new InvalidArgumentError('Expected a positive integer.');
}
