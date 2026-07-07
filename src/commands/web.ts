#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { startWebServer } from '../web/server.js';

const program = new Command();

program
  .name('fetch-trends-web')
  .description('Start the local Fetch Trends web interface.')
  .option('--host <host>', 'host to bind', '127.0.0.1')
  .option('--port <port>', 'port to bind', parsePort, 3000)
  .option('--db <path>', 'SQLite database path')
  .option('--outDir <path>', 'directory for validation artifacts', './results/web')
  .option('--ai <boolean>', 'enable Codex AI tasks for web-triggered jobs: true/false', parseBoolean, false)
  .option('--run-jobs <boolean>', 'run submitted jobs in this web process: true/false', parseBoolean, true)
  .action(async (options: {
    host: string;
    port: number;
    db?: string;
    outDir: string;
    ai: boolean;
    runJobs: boolean;
  }) => {
    const started = await startWebServer({
      aiEnabled: options.ai,
      dbPath: options.db,
      host: options.host,
      onBackgroundError(error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Background job failed: ${message}\n`);
      },
      outDir: options.outDir,
      port: options.port,
      runJobsInProcess: options.runJobs,
    });

    process.stdout.write(`Fetch Trends web interface: ${started.url}\n`);
    process.stdout.write(`In-process jobs: ${options.runJobs ? 'enabled' : 'disabled'}\n`);
  });

await program.parseAsync(process.argv);

function parsePort(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535) {
    return parsed;
  }

  throw new InvalidArgumentError('Expected a TCP port between 1 and 65535.');
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
