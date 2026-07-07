#!/usr/bin/env node
import { Command } from 'commander';
import { openDatabase } from '../db/connection.js';
import { applyMigrations } from '../db/migrations.js';

const program = new Command();

program
  .name('fetch-trends-db')
  .description('Run local SQLite maintenance tasks.')
  .option('--db <path>', 'SQLite database path')
  .option('--migrate', 'apply pending migrations')
  .action(async (options: { db?: string; migrate?: boolean }) => {
    if (!options.migrate) {
      process.stderr.write('Error: pass --migrate to apply pending migrations.\n');
      process.exitCode = 1;
      return;
    }

    const { db, dbPath } = await openDatabase(options.db);

    try {
      const applied = applyMigrations(db);
      for (const migration of applied) {
        process.stdout.write(`Applied ${migration}\n`);
      }
      process.stdout.write(`Database ready: ${dbPath}\n`);
    } finally {
      db.close();
    }
  });

await program.parseAsync(process.argv);
