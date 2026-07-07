import { Command, InvalidArgumentError } from 'commander';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';
import { DEFAULT_MODIFIERS } from '../utilities/autocomplete/constants.js';
import { resolveModifiers } from '../utilities/autocomplete/input.js';
import {
  createDefaultRevalidationServices,
  runPendingRevalidation,
  type DefaultAutocompleteRevalidationOptions,
} from '../revalidation/revalidation-runner.js';
import { scanForRevalidation } from '../revalidation/scheduler.js';
import type { RevalidationServices } from '../revalidation/types.js';

export interface RevalidateProgramDependencies {
  services?: RevalidationServices;
}

export function buildRevalidateProgram(dependencies: RevalidateProgramDependencies = {}): Command {
  return new Command()
    .name('fetch-trends-revalidate')
    .description('Scan for stale validation evidence and run queued local revalidation tasks.')
    .option('--db <path>', 'SQLite database path')
    .option('--scan', 'scan ideas and queue stale evidence refresh tasks')
    .option('--run-pending', 'run pending revalidation queue tasks')
    .option('--idea-id <id>', 'limit scan/run to one idea; alone means scan and run that idea', parsePositiveInteger)
    .option('--portfolio', 'scan all ideas and queue portfolio refresh markers for stale ideas')
    .option('--limit <count>', 'maximum ideas or queue items to process', parsePositiveInteger, 25)
    .option('--country <country>', 'Google country code for autocomplete refreshes', 'US')
    .option('--language <language>', 'Google interface language for autocomplete refreshes', 'en')
    .option('--outDir <path>', 'directory for autocomplete revalidation artifacts', './results/revalidate')
    .option('--depth <depth>', 'autocomplete refresh depth: 1 or 2', parseDepth, 1)
    .option('--modifier <value>', 'custom autocomplete modifier; can be passed multiple times', collectValues, [])
    .option('--modifiers <items-or-path>', 'comma-separated autocomplete modifiers or a TXT file path', collectValues, [])
    .option('--headless <boolean>', 'run browser headless: true/false', parseBoolean, true)
    .option('--no-headless', 'run browser in visible/manual mode')
    .option('--delayMs <ms>', 'base random delay between autocomplete prefixes', parseNonNegativeInteger, 1200)
    .option('--maxPrefixes <count>', 'maximum depth-1 prefixes per seed', parsePositiveInteger, 500)
    .option('--maxDepth2Prefixes <count>', 'maximum depth-2 prefixes per seed', parsePositiveInteger, 100)
    .action(async (options: {
      country: string;
      db?: string;
      delayMs: number;
      depth: 1 | 2;
      headless: boolean;
      ideaId?: number;
      language: string;
      limit: number;
      maxDepth2Prefixes: number;
      maxPrefixes: number;
      modifier: string[];
      modifiers: string[];
      outDir: string;
      portfolio?: boolean;
      runPending?: boolean;
      scan?: boolean;
    }) => {
      try {
        const shouldScan = Boolean(options.scan || options.portfolio || (options.ideaId != null && !options.runPending));
        const shouldRunPending = Boolean(options.runPending || (options.ideaId != null && !options.scan && !options.portfolio));
        if (!shouldScan && !shouldRunPending) {
          throw new Error('Pass --scan, --run-pending, --idea-id, or --portfolio.');
        }

        const { db, dbPath } = await openDatabase(options.db);
        try {
          applyMigrations(db);

          if (shouldScan) {
            const scan = scanForRevalidation(db, {
              ideaId: options.ideaId,
              limit: options.limit,
              portfolio: options.portfolio,
            });
            process.stdout.write(`Revalidation scan ${scan.run.id} completed.\n`);
            process.stdout.write(`Database: ${dbPath}\n`);
            process.stdout.write(`Stale ideas: ${scan.staleResults.length}\n`);
            process.stdout.write(`Queued tasks: ${scan.queued.length}\n`);
            process.stdout.write(`Skipped existing tasks: ${scan.skippedExisting.length}\n`);
          }

          if (shouldRunPending) {
            const modifiers = options.modifier.length === 0 && options.modifiers.length === 0
              ? [...DEFAULT_MODIFIERS]
              : await resolveModifiers(options.modifier, options.modifiers);
            const serviceOptions: DefaultAutocompleteRevalidationOptions = {
              delayMs: options.delayMs,
              depth: options.depth,
              headless: options.headless,
              maxDepth2Prefixes: options.maxDepth2Prefixes,
              maxPrefixes: options.maxPrefixes,
              modifiers,
              outDir: options.outDir,
            };
            const result = await runPendingRevalidation(db, {
              country: options.country,
              ideaId: options.ideaId,
              language: options.language,
              limit: options.limit,
              services: dependencies.services ?? createDefaultRevalidationServices(serviceOptions),
            });
            process.stdout.write(`Revalidation run ${result.run.id} completed with status ${result.run.status}.\n`);
            process.stdout.write(`Processed tasks: ${result.processed.length}\n`);
            for (const [status, count] of Object.entries(countStatuses(result.summaries))) {
              process.stdout.write(`${status}: ${count}\n`);
            }
            for (const report of result.reports) {
              process.stdout.write(`Stored revalidation report ${report.id} for idea ${report.idea_id}.\n`);
            }
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
}

export async function runRevalidateCli(argv: string[]): Promise<void> {
  await buildRevalidateProgram().parseAsync(argv);
}

function countStatuses(summaries: Array<{ status: string }>): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const summary of summaries) {
    counts[summary.status] = (counts[summary.status] ?? 0) + 1;
  }

  return counts;
}

function collectValues(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parseDepth(value: string): 1 | 2 {
  const parsed = Number(value);
  if (parsed === 1 || parsed === 2) {
    return parsed;
  }

  throw new InvalidArgumentError('--depth must be 1 or 2.');
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

function parseNonNegativeInteger(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed >= 0) {
    return parsed;
  }

  throw new InvalidArgumentError('Expected a non-negative integer.');
}
