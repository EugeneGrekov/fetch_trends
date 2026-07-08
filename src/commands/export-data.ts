import { Command, InvalidArgumentError } from 'commander';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { buildIdeaExportBundle, buildPortfolioExportBundle, renderBundleMarkdown, writeExportBundle } from '../export/bundle-writer.js';
import type { ExportFormat, RedactionMode } from '../export/types.js';

export interface ExportDataCommandOptions {
  artifactsRoot?: string;
  db?: string;
  format: ExportFormat;
  ideaId?: number;
  limit: number;
  out?: string;
  portfolio?: boolean;
  redaction: RedactionMode;
}

export function buildExportDataProgram(): Command {
  return new Command()
    .name('fetch-trends-export-data')
    .description('Export idea bundles or portfolio summaries from local SQLite data.')
    .option('--db <path>', 'SQLite database path')
    .option('--idea-id <id>', 'export one idea bundle', parsePositiveInteger)
    .option('--portfolio', 'export a portfolio summary bundle')
    .option('--limit <count>', 'maximum ideas to include in a portfolio export', parsePositiveInteger, 25)
    .option('--format <format>', 'output format: json or markdown', parseFormat, 'markdown')
    .option('--out <path>', 'write the bundle to a file instead of stdout')
    .option('--redaction <mode>', 'redaction mode: none, basic, or strict', parseRedactionMode, 'basic')
    .option('--artifacts-root <path>', 'artifact root used to discover local files', './artifacts/ideas')
    .action(async (options: ExportDataCommandOptions) => {
      try {
        validateSelection(options.ideaId, options.portfolio);

        const { db } = await openDatabase(options.db);
        try {
          applyMigrations(db);

          if (options.portfolio) {
            const bundle = await buildPortfolioExportBundle({
              db,
              limit: options.limit,
              redaction: options.redaction,
            });
            await writeExportResult(bundle, options);
            return;
          }

          const bundle = await buildIdeaExportBundle({
            artifactRoot: options.artifactsRoot,
            db,
            ideaId: options.ideaId as number,
            redaction: options.redaction,
          });
          await writeExportResult(bundle, options);
        } finally {
          db.close();
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Error: ${message}\n`);
        process.exitCode = 1;
      }
    });
}

export async function runExportDataCli(argv: string[]): Promise<void> {
  await buildExportDataProgram().parseAsync(argv);
}

async function writeExportResult(
  bundle: Awaited<ReturnType<typeof buildIdeaExportBundle>> | Awaited<ReturnType<typeof buildPortfolioExportBundle>>,
  options: ExportDataCommandOptions,
): Promise<void> {
  if (options.out) {
    await writeExportBundle(bundle, { format: options.format, outPath: options.out });
    process.stdout.write(`Wrote export bundle to ${options.out}\n`);
    return;
  }

  const rendered = options.format === 'markdown'
    ? renderBundleMarkdown(bundle)
    : `${JSON.stringify(bundle, null, 2)}\n`;

  process.stdout.write(rendered);
  if (!rendered.endsWith('\n')) {
    process.stdout.write('\n');
  }
}

function validateSelection(ideaId: number | undefined, portfolio: boolean | undefined): void {
  if ((ideaId == null && !portfolio) || (ideaId != null && portfolio)) {
    throw new Error('Pass exactly one of --idea-id or --portfolio.');
  }
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new InvalidArgumentError('Expected a positive integer.');
}

function parseFormat(value: string): ExportFormat {
  if (value === 'json' || value === 'markdown') {
    return value;
  }

  throw new InvalidArgumentError('Expected --format to be json or markdown.');
}

function parseRedactionMode(value: string): RedactionMode {
  if (value === 'none' || value === 'basic' || value === 'strict') {
    return value;
  }

  throw new InvalidArgumentError('Expected --redaction to be none, basic, or strict.');
}
