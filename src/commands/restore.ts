import { Command } from 'commander';
import { restoreBackupArchive } from '../export/restore.js';

export interface RestoreCommandOptions {
  backup?: string;
  force?: boolean;
  targetArtifactsDir?: string;
  targetDb?: string;
  targetReportsDir?: string;
}

export function buildRestoreProgram(): Command {
  return new Command()
    .name('fetch-trends-restore')
    .description('Restore a local backup into a target SQLite database and optional artifact folders.')
    .requiredOption('--backup <path>', 'backup directory to restore from')
    .requiredOption('--target-db <path>', 'target SQLite database path')
    .option('--target-artifacts-dir <path>', 'optional target artifact directory')
    .option('--target-reports-dir <path>', 'optional target reports directory')
    .option('--force', 'overwrite existing targets')
    .action(async (options: RestoreCommandOptions) => {
      try {
        const result = await restoreBackupArchive({
          backupDir: options.backup as string,
          force: options.force,
          targetArtifactsDir: options.targetArtifactsDir,
          targetDbPath: options.targetDb as string,
          targetReportsDir: options.targetReportsDir,
        });

        process.stdout.write(`Restored database to ${result.targetDbPath}\n`);
        if (result.artifactsRestored && result.targetArtifactsDir) {
          process.stdout.write(`Restored artifacts to ${result.targetArtifactsDir}\n`);
        }
        if (result.targetReportsDir) {
          process.stdout.write(`Restored reports to ${result.targetReportsDir}\n`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        process.stderr.write(`Error: ${message}\n`);
        process.exitCode = 1;
      }
    });
}

export async function runRestoreCli(argv: string[]): Promise<void> {
  await buildRestoreProgram().parseAsync(argv);
}

