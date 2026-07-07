#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { createWebServices } from '../web/services.js';
import type { ValidationResult } from '../validation/types.js';

const program = new Command();

program
  .name('fetch-trends-worker')
  .description('Run pending validation jobs from SQLite.')
  .option('--db <path>', 'SQLite database path')
  .option('--outDir <path>', 'directory for validation artifacts', './results/web')
  .option('--limit <count>', 'maximum pending jobs to run', parsePositiveInteger, 1)
  .option('--ai <boolean>', 'enable Codex AI tasks for worker jobs: true/false', parseBoolean, false)
  .action(async (options: {
    db?: string;
    outDir: string;
    limit: number;
    ai: boolean;
  }) => {
    try {
      const services = createWebServices({
        aiEnabled: options.ai,
        dbPath: options.db,
        outDir: options.outDir,
        resultsPath: './results',
        runJobsInProcess: false,
      });
      const results = await services.runPendingJobs(options.limit);
      const completed = results.filter((result): result is ValidationResult => result != null);

      process.stdout.write(`Processed ${completed.length} pending job(s).\n`);
      for (const result of completed) {
        process.stdout.write(`Job ${result.job.id}: ${result.job.status} for idea ${result.idea.id}\n`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Error: ${message}\n`);
      process.exitCode = 1;
    }
  });

await program.parseAsync(process.argv);

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  throw new InvalidArgumentError('Expected a positive integer.');
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
