import { cp, mkdir, stat, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { resolveDatabasePath } from '../db/connection.js';
import { BACKUP_MANIFEST_VERSION, FETCH_TRENDS_APP_NAME, type BackupArchiveResult, type BackupManifest } from './types.js';
import { copyDirectoryIfPresent } from './backup-helpers.js';

export interface CreateBackupArchiveOptions {
  artifactsDir?: string;
  dbPath?: string;
  outDir?: string;
  reportsDir?: string;
  timestamp?: string;
}

const DEFAULT_BACKUP_ROOT = './backups';
const BACKUP_DB_FILENAME = 'fetch-trends.sqlite';

export async function createBackupArchive(options: CreateBackupArchiveOptions = {}): Promise<BackupArchiveResult> {
  const sourceDbPath = resolveDatabasePath(options.dbPath);
  const sourceDbStats = await stat(sourceDbPath).catch(() => {
    throw new Error(`SQLite database not found at ${sourceDbPath}.`);
  });

  const backupRoot = resolve(options.outDir ?? DEFAULT_BACKUP_ROOT, buildBackupDirectoryName(options.timestamp ?? new Date().toISOString()));
  await mkdir(backupRoot, { recursive: true });

  const dbTargetPath = join(backupRoot, BACKUP_DB_FILENAME);
  await cp(sourceDbPath, dbTargetPath, { force: true, recursive: false });

  const artifactsSourcePath = options.artifactsDir ?? './artifacts';
  const reportsSourcePath = options.reportsDir;
  const artifactsComponent = await copyDirectoryIfPresent(artifactsSourcePath, join(backupRoot, 'artifacts'));
  const reportsComponent = reportsSourcePath
    ? await copyDirectoryIfPresent(reportsSourcePath, join(backupRoot, 'reports'))
    : {
        fileCount: 0,
        included: false,
        sourcePath: null,
        targetPath: 'reports',
        totalBytes: 0,
      };

  const manifest: BackupManifest = {
    app: FETCH_TRENDS_APP_NAME,
    backupType: 'full_backup',
    components: [
      {
        fileCount: artifactsComponent.fileCount,
        included: artifactsComponent.included,
        name: 'artifacts',
        sourcePath: artifactsComponent.sourcePath,
        targetPath: 'artifacts',
        totalBytes: artifactsComponent.totalBytes,
      },
      {
        fileCount: reportsComponent.fileCount,
        included: reportsComponent.included,
        name: 'reports',
        sourcePath: reportsComponent.sourcePath,
        targetPath: 'reports',
        totalBytes: reportsComponent.totalBytes,
      },
    ],
    createdAt: options.timestamp ?? new Date().toISOString(),
    db: {
      fileName: BACKUP_DB_FILENAME,
      sizeBytes: sourceDbStats.size,
      sourcePath: sourceDbPath,
    },
    version: BACKUP_MANIFEST_VERSION,
  };

  await writeFile(join(backupRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

  return { backupDir: backupRoot, manifest };
}

function buildBackupDirectoryName(timestamp: string): string {
  return `fetch-trends-${timestamp.replace(/:/g, '').replace(/\.\d{3}Z$/, 'Z')}`;
}
