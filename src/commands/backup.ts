import { Command } from 'commander';
import { createBackupArchive } from '../export/backup.js';

export interface BackupCommandOptions {
  artifactsDir?: string;
  db?: string;
  out?: string;
  reportsDir?: string;
  timestamp?: string;
}

export function buildBackupProgram(): Command {
  return new Command()
    .name('fetch-trends-backup')
    .description('Create a timestamped backup of the SQLite database and local artifacts.')
    .option('--db <path>', 'SQLite database path')
    .option('--out <path>', 'backup root directory', './backups')
    .option('--artifacts-dir <path>', 'artifact directory to include', './artifacts')
    .option('--reports-dir <path>', 'optional reports directory to include')
    .option('--timestamp <value>', 'backup timestamp override')
    .action(async (options: BackupCommandOptions) => {
      try {
        const result = await createBackupArchive({
          artifactsDir: options.artifactsDir,
          dbPath: options.db,
          outDir: options.out,
          reportsDir: options.reportsDir,
          timestamp: options.timestamp,
        });

        process.stdout.write(`Created backup ${result.backupDir}\n`);
        process.stdout.write(`Database: ${result.manifest.db.sourcePath}\n`);
        process.stdout.write(`Artifacts included: ${result.manifest.components.find((component) => component.name === 'artifacts')?.included ? 'yes' : 'no'}\n`);
        process.stdout.write(`Reports included: ${result.manifest.components.find((component) => component.name === 'reports')?.included ? 'yes' : 'no'}\n`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Error: ${message}\n`);
        process.exitCode = 1;
      }
    });
}

export async function runBackupCli(argv: string[]): Promise<void> {
  await buildBackupProgram().parseAsync(argv);
}
