#!/usr/bin/env node
import { Command, InvalidArgumentError } from 'commander';
import { startAutocompleteBridgeServer } from '../autocomplete-bridge/server.js';

const program = new Command();

program
  .name('fetch-trends-autocomplete-api')
  .description('Start the local authenticated ChatGPT autocomplete bridge API.')
  .option('--host <host>', 'host to bind', '127.0.0.1')
  .option('--port <port>', 'port to bind', parsePort, 3099)
  .option('--db <path>', 'SQLite database path')
  .option('--auth-config <path>', 'local authentication config path', './config/autocomplete-users.json')
  .option('--results-dir <path>', 'autocomplete result directory', './results/chatgpt-autocomplete')
  .action(async (options: {
    host: string;
    port: number;
    db?: string;
    authConfig: string;
    resultsDir: string;
  }) => {
    const started = await startAutocompleteBridgeServer({
      authConfigPath: options.authConfig,
      dbPath: options.db,
      host: options.host,
      port: options.port,
      resultsDir: options.resultsDir,
    });

    process.stdout.write(`Autocomplete bridge API: ${started.url}\n`);
    process.stdout.write(`Authentication config: ${options.authConfig}\n`);
  });

await program.parseAsync(process.argv);

function parsePort(value: string): number {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535) {
    return parsed;
  }

  throw new InvalidArgumentError('Expected a TCP port between 1 and 65535.');
}
